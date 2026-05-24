# DataModel Framework

> **📖 Setup Guide**: For step-by-step instructions on creating new models, see [DATAMODEL_SETUP_GUIDE.md](../../../docs/DATAMODEL_SETUP_GUIDE.md)

## Overview

The DataModel framework provides a unified interface for storing data across KV (full objects) and D1 (queryable metadata). It handles dual writes, provides a clean API, and supports hooks for event-driven workflows.

## Database Migration Rules

### ✅ Safe Operations (Automated)

These operations are **automatically handled** by the migration system:

- **Create missing tables** - New models get their tables created
- **Add new columns** - New fields in existing models get added to D1
- **Create indexes** - New indexes are created automatically
- **Seed initial data** - Run seeds based on conditions

### ❌ Unsafe Operations (Manual Only)

These operations **require manual intervention** due to data safety:

- **Delete columns** - Risk of data loss, must be done manually
- **Change column types** - Risk of data corruption, needs careful conversion
- **Rename columns** - Requires data migration, must be planned manually
- **Drop tables** - High risk operation, manual only

### Manual Migration Process

When you need to perform unsafe operations:

1. **Plan the migration** - Document what needs to change
2. **Backup data** - Export affected data from KV/D1
3. **Write migration script** - Custom logic for data transformation
4. **Test on staging** - Verify migration works correctly
5. **Execute manually** - Run migration during maintenance window
6. **Update model definitions** - Reflect changes in code

### Example Manual Migration

```javascript
// Manual migration for column type change
async function migrateUserAgeToString(datastore, logger) {
  // 1. Get all users from D1
  const users = await datastore.D1.execute('SELECT user_id, age FROM users WHERE age IS NOT NULL');
  
  // 2. Add new column
  await datastore.D1.execute('ALTER TABLE users ADD COLUMN age_string TEXT');
  
  // 3. Convert data
  for (const user of users.results) {
    await datastore.D1.execute(
      'UPDATE users SET age_string = ? WHERE user_id = ?',
      [user.age.toString(), user.user_id]
    );
  }
  
  // 4. Drop old column (after verification)
  // await datastore.D1.execute('ALTER TABLE users DROP COLUMN age');
  
  logger.log('Manual migration completed', { affected: users.results.length });
}
```

## Database Initialization

### Automatic Initialization

The framework automatically handles:

```javascript
// Via CloudFunction after deployment
POST /api/function
{
  "action": "system.initialize"
}
```

This will:
- Create missing tables
- Add new columns
- Run seed data
- Log all changes

### Model Seeding

Add seed data to model definitions:

```javascript
export const UserModel = {
  name: 'USER',
  // ... fields ...
  
  seeds: [
    {
      condition: 'if_empty', // Only if table is empty
      data: {
        email: '${ADMIN_EMAIL}', // From environment variables
        password_hash: '${ADMIN_PASSWORD_HASH}',
        is_admin: true,
        status: 'active'
      }
    }
  ]
}
```

### Seed Conditions

- `always` - Run on every initialization (use sparingly)
- `if_empty` - Only run if table has no records
- `if_missing` - Only run if specific record doesn't exist

## Best Practices

### Schema Design

1. **Plan ahead** - Think about future needs when designing fields
2. **Use nullable fields** - New columns should allow NULL for existing records
3. **Default values** - Provide sensible defaults for new columns
4. **Avoid breaking changes** - Don't change field meanings or types

### Migration Safety

1. **Test migrations** - Always test on development/staging first
2. **Backup data** - Export critical data before major changes
3. **Monitor logs** - Check migration logs for errors
4. **Rollback plan** - Have a plan to revert if things go wrong

### Performance

1. **Limit seed data** - Don't seed large datasets, use separate scripts
2. **Batch operations** - Process large migrations in batches
3. **Index carefully** - Only create indexes you actually need
4. **Monitor timing** - Large migrations may timeout, split them up

## Troubleshooting

### Common Issues

**Migration timeouts:**
- Split large operations into smaller batches
- Use separate migration scripts for bulk data

**Column already exists:**
- Migration system is idempotent, safe to re-run
- Check logs to see what was skipped

**Seed data conflicts:**
- Use `if_empty` or `if_missing` conditions
- Check for unique constraint violations

**Type conversion errors:**
- Manual migration required for type changes
- Export data, transform, re-import

### Getting Help

1. Check migration logs in CloudFunction response
2. Verify model definitions match expectations
3. Test migrations on development environment
4. Contact team for complex migration planning

## File Structure

```
modules/datamodel/
├── README.md              # This file
├── index.js              # Main exports
├── core/
│   ├── datamodel.js      # Core DataModel class
│   └── query-builder.js  # D1 query builder
├── utils/
│   ├── table-manager.js  # Database initialization
│   ├── schema-migrator.js # Schema comparison
│   ├── data-seeder.js    # Initial data population
│   ├── uuid.js           # ID generation
│   ├── validator.js      # Field validation
│   └── sync.js          # KV/D1 synchronization
└── hooks/
    └── manager.js        # Hook execution
```
