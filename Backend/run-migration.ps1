Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Running Prisma Migration & Regeneration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Generating Prisma Client..." -ForegroundColor Yellow
& npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to generate Prisma client" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Step 2: Running database migration..." -ForegroundColor Yellow
& npx prisma migrate dev --name add_claim_workflow_engine
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to run migration" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Migration completed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "All TypeScript errors should now be resolved." -ForegroundColor Green
Write-Host "You can start your application with: npm run start:dev" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
