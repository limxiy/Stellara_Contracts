# 🔧 Fixing TypeScript Errors After Schema Changes

## ❌ Why You're Seeing These Errors

All the TypeScript errors you're seeing are **EXPECTED** and occur because:

1. **Prisma schema was updated** with new models and enums
2. **Prisma Client hasn't been regenerated** yet
3. TypeScript can't find the new types (`ClaimStatus`, `AssessmentStage`, `AssessorRole`, etc.)
4. PrismaService doesn't have the new model methods yet

## ✅ How to Fix (Choose One Method)

### Method 1: Use the Provided Script (Easiest)

**Option A - PowerShell:**
```powershell
cd c:\Users\g-ekoh\Downloads\Stellara_Contracts\Backend
.\run-migration.ps1
```

**Option B - Command Prompt:**
```cmd
cd c:\Users\g-ekoh\Downloads\Stellara_Contracts\Backend
run-migration.bat
```

### Method 2: Manual Commands

Run these commands in order:

```bash
# Navigate to Backend directory
cd c:\Users\g-ekoh\Downloads\Stellara_Contracts\Backend

# Step 1: Regenerate Prisma Client (fixes TypeScript errors)
npx prisma generate

# Step 2: Run database migration (creates new tables)
npx prisma migrate dev --name add_claim_workflow_engine
```

### Method 3: If npx is blocked by execution policy

```powershell
# Navigate to Backend directory
cd c:\Users\g-ekoh\Downloads\Stellara_Contracts\Backend

# Use node directly to run prisma
node node_modules/.bin/prisma generate
node node_modules/.bin/prisma migrate dev --name add_claim_workflow_engine
```

## 🎯 What These Commands Do

### `npx prisma generate`
- Regenerates the Prisma Client TypeScript types
- Adds new model methods to PrismaService
- Fixes all "Module has no exported member" errors
- Fixes all "Property does not exist" errors

### `npx prisma migrate dev`
- Creates a new migration file
- Applies the migration to your database
- Creates new tables: `Assessor`, `ClaimEvidence`, `ClaimAssessment`, `ClaimDispute`
- Adds new enums: `AssessmentStage`, `AssessorRole`, `DisputeStatus`
- Updates existing `Claim` table with new fields

## ✨ After Running Migration

Once you run the migration:

1. ✅ All TypeScript errors will disappear
2. ✅ Your IDE will recognize new Prisma types
3. ✅ PrismaService will have all new model methods
4. ✅ You can start the application: `npm run start:dev`

## 🚀 Quick Start After Migration

```bash
# Start development server
npm run start:dev

# Or with hot reload
npm run start:dev
```

## 📋 Verification

After migration, verify everything works:

```bash
# Check Prisma Studio (visual database browser)
npx prisma studio

# Or test a simple query
node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.claim.findMany().then(console.log)"
```

## ⚠️ Common Issues

### Issue: "npx command not found"
**Solution:** Use the full path to npx or run via node:
```bash
node node_modules/.bin/prisma generate
```

### Issue: "Script execution disabled" (PowerShell)
**Solution:** Run the `.bat` file instead, or:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### Issue: Database connection error
**Solution:** Check your `.env` file has correct `DATABASE_URL`

### Issue: Migration already exists
**Solution:** That's okay! Just run:
```bash
npx prisma migrate dev
```

## 🎓 Understanding the Workflow

Every time you modify `schema.prisma`:

1. **Edit schema.prisma** → Add/modify models
2. **Run `npx prisma generate`** → Update TypeScript types (fixes IDE errors)
3. **Run `npx prisma migrate dev`** → Apply changes to database
4. **Restart your app** → Use new features

This is the standard Prisma workflow and is required for type safety!

---

**Need help?** Check `CLAIM_WORKFLOW_IMPLEMENTATION.md` for full implementation details.
