const knex = require("knex");
module.exports = function (App, Config) {
    const connector = Config.connector || "postgresql";
    const db = knex({client: "pg"});
    const MODELS = App.models;
    const validOperators = ["gt", "gte", "lt", "lte", "between", "inq", "neq", "nin", "like", "ilike"];
    const relationsSupported = ["belongsTo", "hasOne"];

    // Validate if component is enable
    if(Config.disabled) return console.warn("Loopback-component-relation-filter is disabled");

    // Extend query in all models
    Object.values(MODELS).forEach(model => {
        var settings = getSettingsOfModel(model);
        if(settings.enable) model.observe('access', extendQuery);
    });

    function extendQuery(ctx, next){
        var settings = ctx.Model.definition.settings;
        var where = ctx.query.where;
        var mainDataSource = ctx.Model.getDataSource().settings;
        var relationsAlreadyCreated = [];
        try{
            var table = getTableName(ctx.Model);
            var idName = getIdName(ctx.Model);
            var mainQuery = db.table(`${table} as maintable`).columns({[idName]: `maintable.${idName}`}).select();
            
            // add queries
            if(where) decodeObject(where, mainQuery);
            
            // Build SQL Query
            mainQuery.toQuery(); // This is a temp line for fix a bug in knex.

            // Execute SQL query
            ctx.Model.dataSource.connector.execute(mainQuery.toQuery(), [], (err, results) => {
                if(err) console.error("Fatal Error, please report in github", {err});
                else ctx.query.where = {[idName]: {inq: results.map(r => r[idName])}}
                next();
            });
        }catch(err){
            console.error("Fatal Error, please report in github", {err});
            next();
        }

        function decodeObject(where, query, isOR = false){
            Object.keys(where).forEach(key => {
                if(["and", "or"].includes(key)){
                    query.where(function(){
                        where[key].forEach(obj => {
                            decodeObject(obj, this, key == "or");
                        });
                    });
                }else {
                    reviewObject(key, where[key], query, isOR, settings, ctx.Model, "maintable");
                }
            });
        }
    
        function reviewObject(key, value, query, isOR, settings, model, nickParent){
            if(settings.relations && settings.relations[key]){
                var relation = settings.relations[key];
                if(!relationsSupported.includes(relation.type)) return console.warn("Relation not supported, this component only support: " + relationsSupported);
    
                var modelRelation = MODELS[relation.model]; 
                var tableName = getTableName(modelRelation);
                var nick = `second_table_${randomNumber()}`;
                var dataSource = modelRelation.getDataSource().settings;
                
                // Make Join
                var alreadyExists = relationsAlreadyCreated.find(r => r.tableName == tableName && r.foreignKey == relation.foreignKey);
                if(!alreadyExists){
                    var getDblink = (columnName) => {
                        let keys = Object.keys(value);
                        keys.unshift(columnName);
                        let names = keys.join(",");
                        let namesWithTypes = keys.reduce((p, c, i) => {
                            let type = getTypeOfProperty(c, modelRelation);
                            if(type) p += (i != 0 ? ", " : "") + (c + " " + type)
                            return p;
                        }, '');

                        return `join dblink('dbname=${dataSource.database} port=${dataSource.port} host=${dataSource.host} user=${dataSource.user} password=${dataSource.password}', 'SELECT ${names} FROM ${tableName}') as ${nick}(${namesWithTypes})`
                    }

                    let isDifferentSource = dataSource.connectionString != mainDataSource.connectionString;
                    let startLine = `join ${tableName} as ${nick}`;

                    switch (relation.type) {
                        case "belongsTo":
                            var tableIdName = relation.primaryKey ? getRealNameOfColumn(relation.primaryKey, modelRelation) : getIdName(modelRelation);
                            var columnName = getRealNameOfColumn(relation.foreignKey, model);
                            mainQuery.joinRaw(`${isDifferentSource ? getDblink(tableIdName) : startLine} on "${nickParent}".${columnName} = "${nick}"."${tableIdName}"`);  
                            break;
                        case "hasOne":
                            var columnName = relation.primaryKey ? getRealNameOfColumn(relation.primaryKey, model) : idName;
                            var foreignKeyName = getRealNameOfColumn(relation.foreignKey, modelRelation);
                            mainQuery.joinRaw(`${isDifferentSource ? getDblink(foreignKeyName) : startLine} on "${nickParent}".${columnName} = "${nick}"."${foreignKeyName}"`)
                            break;
                        default: return console.warn("Relation not supported, this component only support: " + relationsSupported);
                    }

                    // Add in the array of relations 
                    relationsAlreadyCreated.push({tableName, nick, foreignKey: relation.foreignKey});
                }else {
                    nick = alreadyExists.nick
                }
                
                // Apply filters
                Object.keys(value).forEach(newKey => {
                    let lsettings = modelRelation.definition.settings;
                    if(lsettings.relations && lsettings.relations[newKey]) reviewObject(newKey, value[newKey], query, isOR, lsettings, modelRelation, nick);
                    else applyFilter(newKey, value[newKey], query, nick, isOR, modelRelation);
                });
            }else {
                applyFilter(key, value, query, "maintable", isOR, model);
            }
        }
    
        function applyFilter(key, _value, query, tableNick, isOR, model){
            var operator = "=";
            var value = _value;

            // Set Value and Operator
            if(_value && typeof _value == "object") {
                var newkey = Object.keys(_value)[0];
                if(validOperators.includes(newkey)){
                    operator = newkey
                    value = _value[operator];
                    applyOperatorOperation(operator, tableNick, key, value, query, isOR, model);
                }else console.warn(`The operator "${newkey}" doesn't support`)
            }else applyOperatorOperation(operator, tableNick, key, value, query, isOR, model);
        }
    
        function applyOperatorOperation(operator, tableNick,  _columnName, value, query, isOR, model){  
            var initFun = "where";
            var realName = getRealNameOfColumn(_columnName, model);
            var columnName = `${tableNick}.${realName}`;

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
                case "neq": return query[initFun + "Not"](columnName, value);
                case "nin": return query[initFun + "NotIn"](columnName, value);
                case "like": return query[initFun](columnName, "like", value);
                case "ilike": return query[initFun](columnName, "ilike", value);
                default: return console.error(`Invalid operator: "${operator}" for now only accepted ${validOperators.join(", ")}`);
            }
        }
    }

    function getTableName(model){
        try{
            var settings = model.definition.settings;
            return settings[connector].table 
        }catch(err){
            return model.modelName.toLowerCase();
        }
    }

    function getTypeOfProperty(property, model){
        let properties = model.definition.properties;
        if(properties[property]){
            let type = properties[property].type.name.toLowerCase();
            switch (type) {
                case "number": return "int";
                case "date": return "timestamptz";
                case "boolean": return "bool";
                case "geopoint": return "point";
                default: return "text"
            }
        }
    }

    function getIdName(model){
        try{
            var mainProperty = model.definition._ids[0]; 
            if(mainProperty.property && mainProperty.property[connector]) return mainProperty.property[connector].columnName || mainProperty.name;
            else return mainProperty.name;
        }catch(err){
            return {name: "id"}
        }
    }

    function getRealNameOfColumn(columnName, model){
        try{
            return model.definition.properties[columnName][connector].columnName;
        }catch{            
            return columnName.toLowerCase();
        }
    }

    function randomNumber(){
        return ((Date.now() * Math.floor(Math.random() * 500)) + "").substr(-4);
    }

    function getSettingsOfModel(model){
        return model.definition.settings.relationFilter || Config;
    }
}