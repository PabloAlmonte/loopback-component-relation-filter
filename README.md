# loopback-component-relation-filter
Advanced Relation Filter for loopback (3)

####  [Purpose](https://github.com/PabloAlmonte/loopback-component-relation-filter#Purpose "Purpose")

By default, Loopback3 does not allow filtering over relations and related models. This component enables said feature by adding query pre-processing which loads the ids of the requested entities in one single query from the database.

####  [Configuration](https://github.com/PabloAlmonte/loopback-component-relation-filter#Configuration "Configuration")

Enable/disable extended searching for all models in your `component-config.json`
```json
{
    "loopback-component-relation-filter": {
        "enabled": true
    }
}
```

Enable/disable searching for a specific model in your `model-config.json` (or also in your models definition file):

```json
{
    "YourModel": {
        "options": {
            "relationFilter": {
                "enabled": false
            }
        }
    }
}
```

####  [Usage](https://github.com/PabloAlmonte/loopback-component-relation-filter#Usage "Usage")

The component uses Loopback's where query to create a big sql query against the database. Enable the filtering on your model and nest your where queries. **The component supports a majority of the documented operators except `near` and `regexp`.**

```javascript
// e.g. load all books having an author which is employed by a certain publisher and is older than
// a certain age
const filter = {
    where: {
        author {
            employer: {
                identifier: 'fancy-publishing'
            },
            age: {
                gt: 20,
            },
        },
    },
};
const books = await Book.find(filter);
```
