# 📋 CF64JS Model API - Simple Two-Phase Plan

## 🎯 **Goal**
Add `cf.model['modelName'].operation()` API to CF64JS client with minimal code and maximum impact.

## ⚡ **PHASE 1: FAST EXECUTION (1-2 hours)**

### **Actual Code Required: ~60 lines total**

#### **Step 1: Model API Class (~40 lines)**
```javascript
class CF64ModelAPI {
  constructor(cf, modelName) { this.cf = cf; this.modelName = modelName; }
  
  async get(id, obs) { 
    const result = await this.cf.run(`${this.modelName}.get`, { id });
    if (obs && result.success) this._update(obs, result.data.data, 'item');
    return result;
  }
  
  async list(params, obs) { 
    const result = await this.cf.run(`${this.modelName}.list`, params || {});
    if (obs && result.success) this._update(obs, result.data.data, 'list');
    return result;
  }
  
  async create(data, obs) { 
    const result = await this.cf.run(`${this.modelName}.create`, data);
    if (obs && result.success) await this.list({}, obs);
    return result;
  }
  
  async update(id, data, obs) { 
    const result = await this.cf.run(`${this.modelName}.update`, { id, ...data });
    if (obs && result.success) await this.list({}, obs);
    return result;
  }
  
  async execute(funcName, data, obs) { 
    const result = await this.cf.run(`${this.modelName}.${funcName}`, data);
    if (obs && result.success) await this.list({}, obs);
    return result;
  }
  
  _update(obs, data, type) {
    const observables = Array.isArray(obs) ? obs : [obs];
    observables.forEach(o => {
      if (type === 'list' && o.setItems) o.setItems(data);
    });
  }
}
```

#### **Step 2: CF Integration (~10 lines)**
```javascript
// Add to CFramework constructor
this.model = new Proxy({}, {
  get: (target, modelName) => {
    if (!target[modelName]) {
      target[modelName] = new CF64ModelAPI(this, modelName);
    }
    return target[modelName];
  }
});
```

#### **Step 3: Simple Tests (5 files, ~15 lines each)**
```javascript
// test-model-get.js
const result = await cf.model['todo'].get("todo:mfyf60w2ue436m");
console.log('✅ GET:', result.success ? 'PASSED' : 'FAILED');

// test-model-list.js  
const result = await cf.model['todo'].list({ page: 1, pageSize: 5 });
console.log('✅ LIST:', result.success ? 'PASSED' : 'FAILED');

// test-model-create.js
const result = await cf.model['todo'].create({ title: 'Model API Test' });
console.log('✅ CREATE:', result.success ? 'PASSED' : 'FAILED');

// test-model-update.js
const result = await cf.model['todo'].update("todo:xyz", { completed: true });
console.log('✅ UPDATE:', result.success ? 'PASSED' : 'FAILED');

// test-model-execute.js
const result = await cf.model['todo'].execute("completed", { id: "todo:xyz" });
console.log('✅ EXECUTE:', result.success ? 'PASSED' : 'FAILED');
```

### **Phase 1 Deliverables:**
- ✅ **60 lines of code** (1 class + 1 proxy)
- ✅ **5 simple tests** (75 lines total)
- ✅ **Working API** using existing live backend
- ✅ **No breaking changes** (additive only)

## 🚀 **PHASE 2: POLISH & PACKAGE (optional)**

### **Enhancement & Documentation:**
- Better error handling
- Observable update improvements  
- Demo page
- Documentation

## 📊 **TOTAL EFFORT:**

**Phase 1:** ~135 lines of code, 1-2 hours work
**Phase 2:** Documentation and polish

**Much simpler than the original plan!** We can get this working in 1-2 hours using our existing live backend.
