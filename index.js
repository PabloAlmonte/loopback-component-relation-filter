const knex = require("knex");
​
module.exports = function (App, Config) {
    const connector = "postgresql";
    const db = knex({client: "pg"});
    const MODELS = App.models;
​
    var model = App.models.CryptoInvoice;
    model.observe('access', (ctx, next) => {
        var settings = ctx.Model.definition.settings;
        var where = ctx.query.where;
        try{
            var table = getTableName(ctx.Model);
            var idName = getIdName(ctx.Model).name;
            var query = db.table(`${table} as maintable`).columns({[idName]: `maintable.${idName}`}).select();
            Object.keys(where).filter(k => settings.relations[k]).forEach((key, i) => {
                var relation = settings.relations[key];
                var filter = where[key];
                var modelRelation = MODELS[relation.model]; 
                var tableName = getTableName(modelRelation);
                var tableIdName = getIdName(modelRelation).name;
                var nick = `t_${i}`;
​
                console.log({relation})
​
                query.join(`${tableName} as ${nick}`, relation.foreignKey.toLowerCase(), `${nick}.${tableIdName}`);
                Object.keys(filter).forEach(column => {
                    var value = filter[column];
                    query.where(`${nick}.${column}`, value);
                });
            });
        
            ctx.Model.dataSource.connector.execute(query.toQuery(), [], (err, results) => {
                if(err) console.error("Fatal Error, please report in github", err);
                where[idName] = {inq: results.map(r => r[idName])}
                next();
            });
        }catch(err){
            console.error({err});
        }
    });
​
    model.find({ order: "created desc", include: ["currencyFrom", "from"], where: {
        currencyFrom: {iso3: "USD"}
    }}, (err, res) => {
        if (err) return console.error(err);
        console.log({ res });
    });
​
​
    function getTableName(model){
        try{
            var settings = model.definition.settings;
            return settings[connector].table 
        }catch(err){
            model.modelName;
        }
    }
​
    function getIdName(model){
        var ids = model.definition._ids[0];
        return ids
    }
}