# ⚡ CFKit Cursor Quick Reference

**For Cursor AI Assistant** - Essential commands and patterns

---

## 🚨 **Critical Model Requirements**

```javascript
// EVERY model MUST have:
fields: {
  modelname_id: {
    type: 'string',
    primary: true,    // ← REQUIRED
    auto: true,       // ← REQUIRED  
    prefix: 'xxx'     // ← REQUIRED (3 letters)
  }
  // ... other fields
}
```

---

## 🔧 **Essential Commands**

```bash
# Generate schema from models
npm run sync-schema

# Deploy with auto-schema
npm run deploy

# Development
npm run dev
```

---

## 📝 **Model Template**

```javascript
// src/models/my-model.js
export const MyModel = {
  name: 'MYMODEL',
  fields: {
    mymodel_id: { type: 'string', primary: true, auto: true, prefix: 'mym' },
    name: { type: 'string', required: true },
    status: { type: 'string', default: 'active' }
  },
  kv: { namespace: 'MYMODELS' },
  d1: { 
    table: 'mymodels',
    syncFields: ['mymodel_id', 'name', 'status', 'created_at', 'updated_at']
  },
  options: { timestamps: true, softDelete: true }
};

// Register in src/models/register-all.js
DataModel.registerModel(MyModel);
```

---

## 🚨 **Common Errors & Fixes**

| Error | Fix |
|-------|-----|
| `Unknown class: MYMODEL` | Create KV namespace + add to wrangler.toml |
| `Missing primary key field` | Add `primary: true, auto: true` to field |
| `Failed to create table` | Run `npm run sync-schema` first |
| `Not authenticated` | Set `auth: false` for public functions |

---

## 🔄 **Setup Checklist**

1. ✅ Model has primary key field
2. ✅ KV namespace created in Cloudflare
3. ✅ KV binding added to wrangler.toml  
4. ✅ Model imported in register-all.js
5. ✅ Run `npm run sync-schema`
6. ✅ Deploy with `npm run deploy`

---

## 📞 **Auto-Generated CloudFunctions**

Every model gets:
- `{model}.create` - Create record
- `{model}.get` - Get single record  
- `{model}.list` - List records
- `{model}.update` - Update record
- `{model}.delete` - Delete record

---

**Full guide**: [CFKIT_CURSOR_DEVELOPER_GUIDE.md](CFKIT_CURSOR_DEVELOPER_GUIDE.md)
