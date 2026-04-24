@echo off
echo ========================================
echo Running Prisma Migration & Regeneration
echo ========================================
echo.

echo Step 1: Generating Prisma Client...
call npx prisma generate
if %errorlevel% neq 0 (
    echo ERROR: Failed to generate Prisma client
    pause
    exit /b %errorlevel%
)

echo.
echo Step 2: Running database migration...
call npx prisma migrate dev --name add_claim_workflow_engine
if %errorlevel% neq 0 (
    echo ERROR: Failed to run migration
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================
echo Migration completed successfully!
echo ========================================
echo.
echo All TypeScript errors should now be resolved.
echo You can start your application with: npm run start:dev
echo.
pause
