const
    _ = require('lodash'),
    kefir = require('kefir'),
    express = require('express'),
    path = require('path');

const BEACON_PROPERTY_DEBOUNCE = 100;

module.exports = class {

    constructor({ port = 8080, model } = {}){
        let app = express();
        app.use(express.static(path.join(__dirname, 'public')));

        app.get('/beacon', (req, res)=> {
            res.contentType('text/event-stream');
            let closeStream = kefir.fromEvents(res, 'close').take(1);
            _(model).forEach((property, eventName)=>
                property
                    .debounce(BEACON_PROPERTY_DEBOUNCE, { immediate: true })
                    .takeUntilBy(closeStream)
                    .onValue((state)=> res.write(["event: " + eventName + "\n", "data: ", JSON.stringify(state), "\n\n"].join('')))
            );
        });

        app.listen(port);
    }
};