const
    _ = require('lodash'),
    qs = require('querystring'),
    kefir = require('kefir'),
    https = require('https');

module.exports = function({
    api_version = "2.8",
    port = 2376,
    host = "localhost",
    ca,
    cert,
    key
}){

  const
      version = Number(_.first(api_version.match(/([0-9.]*)\s*$/)) || "2.8").toString(),
      request = (method = "GET", path, query = {}, body)=> {
        let req = https.request({
            method,
            host,
            port,
            ca,
            cert,
            key,
            query,
            path: [[`/v${version}`, _(path).split('/').compact().join('/')].join('/'), !_.isEmpty(query) && qs.stringify(query)].filter(Boolean).join('?')
        });

        req.end(body && (function(json){ req.setHeader('Content-Type', 'application/json'); return body; })(JSON.stringify(body)) );
        return req;
    },
    requestStream = _.flow(request, (req)=> {
      return kefir
        .merge([
            kefir.fromEvents(req, 'response'),
            kefir.fromEvents(req, 'error').flatMap((err)=> kefir.constantError(err))
        ])
        .take(1)
        .flatMap((res)=> {
          res.setEncoding(undefined);
          let statusCode = Number(_.get(res, 'statusCode'));
          return kefir.concat([
              kefir.constant({
                  "type": "header",
                  "contentType": _.get(res, 'headers.content-type'),
                  statusCode
              }),
              kefir
                  .fromEvents(res, 'data').takeUntilBy(kefir.fromEvents(res, 'end').take(1))
                  .flatMap(kefir[statusCode === 200 ? "constant" : "constantError"])
                  .map((payload)=>({ "type": "body", payload }))
                  .mapErrors((payload)=>({ "type": "error", payload, status_code: statusCode }))
          ]);
        });
    }),
    requestJsonBuffer = _.flow(requestStream, (stream)=>{

        return stream
          .filter(_.matches({ type: "header", "contentType": "application/json" }))
          .flatMap(()=> {
            return stream
                .filter(({ type })=> type === "body")
                .map(({ payload })=> payload)
                .scan((buffer, chunk)=> buffer.concat(chunk.toString('utf8')), [])
                .last()
                .map((arr)=> arr.join(''))
                .map(JSON.parse)
          })
            .takeErrors(1)
            .toPromise();
    });

  return {
      getContainer: ()=> requestJsonBuffer('GET', 'containers/json', { all: true }),
      getNode: ()=> requestJsonBuffer('GET', 'nodes', {}),
      getSwarm: ()=> requestJsonBuffer('GET', 'swarm', {})
  };
};