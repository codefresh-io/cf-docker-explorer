const
    _ = require('lodash'),
    fs = require('fs'),
    path = require('path'),
    kefir = require('kefir'),
    WebView = require('./web_view'),
    parseArgs = require('minimist'),
    dockerClientFactory = require('./lib/docker');

const MONITOR_REFRESH_INTERVAL = 1000;

let { folder, host, port } = parseArgs(process.argv.slice(2), {
    default: {
        "folder": ".",
        "host": "localhost",
        "port": 2376
    },
    alias: {
        "folder": "f",
        "host": "h",
        "port": "p"
    },

});

let docker = dockerClientFactory(
    _.assign(
        { host, port },
        (([ca, cert, key])=> ({ ca, cert, key }))(["ca", "cert", "key"].map((name)=> fs.readFileSync(path.resolve(folder, [name, "pem"].join('.')))))
    )
);

let [nodeState, containerState, swarmState] = (function(monitorChannelStreamFactory){
    return [docker.getNode,docker.getContainer,docker.getSwarm].map((generator)=> monitorChannelStreamFactory(generator).onValue(_.noop));
})(function(promiseGenerator){
    return kefir.repeat(()=>
        kefir.concat([
            kefir.fromPromise(promiseGenerator()),
            kefir.later(MONITOR_REFRESH_INTERVAL).flatMap(kefir.never)
        ])
    );
});

let webView = new WebView({
    model: {
        node: nodeState.flatMapErrors(()=> kefir.constant([])).toProperty(_.constant([])).skipDuplicates(_.isEqual),
        container: containerState.flatMapErrors(()=> kefir.constant([])).toProperty(_.constant([])).skipDuplicates(_.isEqual),
        swarm: swarmState.flatMapErrors(()=> kefir.constant({})).toProperty(_.constant({})).skipDuplicates(_.isEqual),
        is_swarm: swarmState.map(()=> true).flatMapErrors(()=> kefir.constant(false)).toProperty(_.constant(null)).skipDuplicates(_.isEqual)
    }
});