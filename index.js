const knex = require("knex");

module.exports = function (App, Config) {
    const connector = "postgresql";
    const db = knex({client: "pg"});
    const MODELS = App.models;
    const validOperators = ["gt", "gte", "lt", "lte", "between", "inq"];

    var model = App.models.CryptoInvoice;

    model.find({ order: "currencyPrice asc", include: ["currencyFrom", "currencyTo", "from", "to"], where: {
        to: {iso3: "DOM"},
        currencyFrom: {iso3: {inq: ["EUR","BKp"]}},
        or: [
            // {currencyTo: {iso3: "USD"}}
            {from: {firstName: "Andres"}},
            {from: {mobilePhone: "8262626"}},
            // {from: {lastName: "Almonte"}},
            // {and: [
            //     {from: {firstName: "Andres"}},
            //     {from: {lastName: "almonte"}},
            // ]}
        ]
    }}, (err, res) => {
        if (err) return console.error(err);
        console.log({ res });
    });

    model.observe('access', (ctx, next) => {
        var settings = ctx.Model.definition.settings;
        var where = ctx.query.where;
        var relationsAlreadyCreated = [];
        try{
            var table = getTableName(ctx.Model);
            var idName = getIdName(ctx.Model).name;
            var query = db.table(`${table} as maintable`).columns({[idName]: `maintable.${idName}`}).select();
            
            decodeObject(where, query);

            // next();
            console.log({query: query.toQuery()});

            // Execute SQL query
            ctx.Model.dataSource.connector.execute(query.toQuery(), [], (err, results) => {
                if(err) console.error("Fatal Error, please report in github", err);
                else ctx.query.where = {[idName]: {inq: results.map(r => r[idName])}}
                next();
            });
        }catch(err){
            console.error({err});
        }

        function decodeObject(where, query, isOR = false){
            Object.keys(where).forEach(key => {
                if(["and", "or"].includes(key)){
                    query.where(function(){
                        where[key].forEach(obj => {
                            decodeObject(obj, this, true);
                        });
                    });
                }else {
                    reviewObject(key, where[key], query, isOR);
                }
            });
        }
    
        function reviewObject(key, value, query, isOR){
            if(settings.relations[key]){
                var relation = settings.relations[key];
                if(relation.type != "belongsTo") return;
    
                var modelRelation = MODELS[relation.model]; 
                var tableName = getTableName(modelRelation);
                var tableIdName = getIdName(modelRelation).name;
                var nick = `second_table_${randomNumber()}`;
    
                // Make Join
                var alreadyExists = relationsAlreadyCreated.find(r => r.tableName == tableName && r.foreignKey == relation.foreignKey);
                if(!alreadyExists){
                    console.log("Sure: ", tableName, nick)
                    query.join(`${tableName} as ${nick}`, relation.foreignKey.toLowerCase(), `${nick}.${tableIdName}`);  
                    relationsAlreadyCreated.push({tableName, nick, foreignKey: relation.foreignKey});
                }else {
                    nick = alreadyExists.nick
                }
                
                // Apply filters
                Object.keys(value).forEach(newKey => {
                    applyFilter(newKey, value[newKey], query, nick, isOR);
                });
            }else {
                applyFilter(key, value, query, "maintable", isOR);
            }
        }
    
        function applyFilter(key, _value, query, tableNick, isOR){
            var operator = "=";
            var value = _value;
            var columnName =  `${tableNick}.${key}`;

            // Set Value and Operator
            if(typeof _value == "object") {
                var newkey = Object.keys(_value)[0];
                if(validOperators.includes(newkey)){
                    operator = newkey
                    value = _value[operator];
                }
            }
        
            applyOperatorOperation(operator, columnName, value, query, isOR);
        }
    
        function applyOperatorOperation(operator, _columnName, value, query, isOR){  
            var initFun = "where";
            var columnName = _columnName.toLowerCase();
            if(isOR){
                initFun = "orWhere";
            } 

            switch (operator) {
                case "=": return query[initFun](columnName, value);
                case "gt": return query[initFun](columnName, ">", value);
                case "gte": return query[initFun](columnName, ">=", value);
                case "lt": return query[initFun](columnName, "<", value);
                case "lte": return query[initFun](columnName, "<=", value);
                case "between": return query[initFun + "Between"](columnName, value);
                case "inq": return query[initFun + "In"](columnName, value);
                default: return console.error(`Invalid operator: "${operator}" for now only accepted ${validOperators.join(", ")}`);
            }
        }
    });


    function getTableName(model){
        try{
            var settings = model.definition.settings;
            return settings[connector].table 
        }catch(err){
            model.modelName;
        }
    }

    function getIdName(model){
        var ids = model.definition._ids[0];
        return ids
    }

    function randomNumber(){
        return ((Date.now() * Math.floor(Math.random() * 500)) + "").substr(-4);
    }
}