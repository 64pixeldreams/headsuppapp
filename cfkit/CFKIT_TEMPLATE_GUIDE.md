# 🚀 CFKit Template - Easy Project Setup

**Copy these key components to any new project for instant CFKit setup**

---

## 📁 **Essential Files to Copy**

### **1. Core Framework Files**
```
src/modules/
├── datamodel/
│   ├── index.js
│   ├── core/datamodel.js          # ✅ With primary key validation
│   ├── utils/schema-generator.js
│   ├── utils/table-manager.js
│   └── enhanced-registration.js
├── datastore/
│   ├── index.js
│   └── adapters/kv.js             # ✅ With dynamic mapping
├── cloudfunction/
│   └── index.js
├── auth/
│   └── index.js
└── logs/
    └── index.js
```

### **2. Frontend Components**
```
www/
├── cframeworkjs/
│   ├── cframework.js              # ✅ With auth fix
│   └── README.md
└── PX64JS/
    ├── px64.js
    └── px64.css
```

### **3. Scripts & Config**
```
scripts/
└── sync-schema.js                 # ✅ Auto schema generation

package.json                       # ✅ With sync-schema command
wrangler.toml                      # Template config
```

### **4. Documentation**
```
CFKIT_CURSOR_DEVELOPER_GUIDE.md    # Complete guide
CFKIT_CURSOR_QUICK_REFERENCE.md    # Quick reference
```

---

## 🚀 **Quick Setup Methods**

### **Method 1: Copy Template Files**
```bash
# 1. Create new project
mkdir my-new-project
cd my-new-project

# 2. Copy essential files from CFKit
cp -r /path/to/cflarejs/src/modules ./src/
cp -r /path/to/cflarejs/www/cframeworkjs ./www/
cp -r /path/to/cflarejs/www/PX64JS ./www/
cp -r /path/to/cflarejs/scripts ./
cp /path/to/cflarejs/package.json ./
cp /path/to/cflarejs/wrangler.toml ./

# 3. Update package.json name
# 4. Create your first model
# 5. Run npm run sync-schema
```

### **Method 2: NPM Package (Recommended)**
```bash
# Install CFKit as dependency
npm install @cfkit/framework

# Copy template files
npx cfkit init my-project
```

### **Method 3: Git Template**
```bash
# Use as template repository
git clone https://github.com/your-org/cfkit-template my-project
cd my-project
rm -rf .git
git init
```

---

## 📋 **Project Setup Checklist**

### **Step 1: Copy Core Files**
- [ ] Copy `src/modules/` directory
- [ ] Copy `www/cframeworkjs/` directory  
- [ ] Copy `www/PX64JS/` directory
- [ ] Copy `scripts/` directory
- [ ] Copy `package.json` and `wrangler.toml`

### **Step 2: Update Configuration**
- [ ] Update `package.json` name and description
- [ ] Update `wrangler.toml` with your project details
- [ ] Create project-specific KV namespaces
- [ ] Create project-specific D1 database

### **Step 3: Create Your First Model**
```javascript
// src/models/my-model.js
export const MyModel = {
  name: 'MYMODEL',
  fields: {
    mymodel_id: {
      type: 'string',
      primary: true,    // ✅ REQUIRED
      auto: true,       // ✅ REQUIRED
      prefix: 'mym'     // ✅ REQUIRED
    },
    name: { type: 'string', required: true },
    status: { type: 'string', default: 'active' }
  },
  kv: { namespace: 'MYMODELS' },
  d1: { 
    table: 'mymodels',
    syncFields: ['mymodel_id', 'name', 'status', 'created_at', 'updated_at']
  }
};

// Register in src/models/register-all.js
DataModel.registerModel(MyModel);
```

### **Step 4: Setup Cloudflare Resources**
```bash
# Create KV namespaces
wrangler kv namespace create "MYMODELS"

# Create D1 database  
wrangler d1 create my-project-db

# Update wrangler.toml with real IDs
```

### **Step 5: Generate Schema & Deploy**
```bash
# Generate schema
npm run sync-schema

# Deploy
npm run deploy
```

---

## 🎯 **Minimal Project Structure**

```
my-project/
├── src/
│   ├── modules/           # ✅ Core framework (copy from CFKit)
│   ├── models/            # Your models
│   │   ├── register-all.js
│   │   └── my-model.js
│   └── index.js           # Worker entry point
├── www/
│   ├── cframeworkjs/      # ✅ Frontend client (copy from CFKit)
│   ├── PX64JS/           # ✅ Reactive framework (copy from CFKit)
│   └── index.html        # Your app
├── scripts/
│   └── sync-schema.js    # ✅ Auto schema generation (copy from CFKit)
├── package.json          # ✅ With sync-schema command (copy from CFKit)
├── wrangler.toml         # Your Cloudflare config
└── schema.sql            # Auto-generated
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

## 📚 **Documentation**

- **[CFKIT_CURSOR_DEVELOPER_GUIDE.md](CFKIT_CURSOR_DEVELOPER_GUIDE.md)** - Complete guide
- **[CFKIT_CURSOR_QUICK_REFERENCE.md](CFKIT_CURSOR_QUICK_REFERENCE.md)** - Quick reference

---

## 🚀 **Ready to Use!**

With these components copied, you have:
- ✅ **Auto-generated CRUD CloudFunctions**
- ✅ **KV/D1 hybrid storage**
- ✅ **Primary key validation**
- ✅ **Dynamic KV mapping**
- ✅ **Public function support**
- ✅ **Schema auto-generation**
- ✅ **PX64JS reactive frontend**
- ✅ **CFramework client**

**Your new project is ready for Cursor/AI development!** 🎯
