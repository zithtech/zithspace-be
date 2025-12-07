const fs = require('fs');
const path = require('path');

/**
 * Automated refactoring script to replace tenantAwarePrisma.withTenant() calls
 * with direct prisma usage across controllers
 */

const controllersToRefactor = [
  'settingsController.ts',
  'userController.ts',
  'projectController.ts'
];

const controllersPath = path.join(__dirname, 'src', 'controllers');

function refactorFile(filePath) {
  console.log(`\n🔧 Refactoring: ${path.basename(filePath)}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changeCount = 0;

  // Step 1: Update import statement
  if (content.includes("import { tenantAwarePrisma }")) {
    content = content.replace(
      /import\s*{\s*tenantAwarePrisma\s*}\s*from\s*['"]@\/config\/database['"]/g,
      "import { prisma } from '@/config/database'"
    );
    console.log('  ✓ Updated import statement');
    changeCount++;
  }

  // Step 2: Replace withTenant() wrapper patterns
  
  // Pattern 1: Simple return statement
  // const result = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
  //   return await client.model.findMany({ ... });
  // });
  const pattern1 = /await\s+tenantAwarePrisma\.withTenant\s*\(\s*req\.tenantId\s*,\s*async\s*\(\s*client\s*\)\s*=>\s*\{\s*return\s+await\s+client\./g;
  const matches1 = content.match(pattern1);
  if (matches1) {
    content = content.replace(pattern1, 'await prisma.');
    console.log(`  ✓ Replaced ${matches1.length} simple return patterns`);
    changeCount += matches1.length;
  }

  // Pattern 2: Multi-line operations with return
  // We need to handle this more carefully - unflatten the code
  const pattern2Regex = /await\s+tenantAwarePrisma\.withTenant\s*\(\s*req\.tenantId\s*,\s*async\s*\(\s*client\s*\)\s*=>\s*\{([^}]+return[^}]+)\}\s*\)/gs;
  const pattern2Matches = content.match(pattern2Regex);
  
  if (pattern2Matches) {
    pattern2Matches.forEach(match => {
      // Extract the inner code
      const innerCodeMatch = match.match(/async\s*\(\s*client\s*\)\s*=>\s*\{([\s\S]+)\}\s*\)$/);
      if (innerCodeMatch) {
        let innerCode = innerCodeMatch[1];
        // Replace client. with prisma.
        innerCode = innerCode.replace(/client\./g, 'prisma.');
        // Replace the entire block
        content = content.replace(match, innerCode.trim());
        changeCount++;
      }
    });
    console.log(`  ✓ Unflattened ${pattern2Matches.length} multi-operation blocks`);
  }

  // Pattern 3: Handle remaining client. references
  content = content.replace(/(\s+)client\./g, '$1prisma.');
  
  // Pattern 4: Clean up any remaining tenantAwarePrisma references
  const remainingCount = (content.match(/tenantAwarePrisma/g) || []).length;
  if (remainingCount > 0) {
    console.log(`  ⚠️  Warning: ${remainingCount} tenantAwarePrisma references still remain (may need manual review)`);
  }

  // Write back
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  ✅ Completed with ${changeCount} changes`);
  
  return changeCount;
}

// Main execution
console.log('🚀 Starting controller refactoring...\n');
console.log('Target controllers:', controllersToRefactor.join(', '));

let totalChanges = 0;

controllersToRefactor.forEach(filename => {
  const filePath = path.join(controllersPath, filename);
  
  if (fs.existsSync(filePath)) {
    try {
      const changes = refactorFile(filePath);
      totalChanges += changes;
    } catch (error) {
      console.error(`  ❌ Error refactoring ${filename}:`, error.message);
    }
  } else {
    console.log(`  ⚠️  File not found: ${filename}`);
  }
});

console.log(`\n✨ Refactoring complete! Total changes: ${totalChanges}`);
console.log('\n⚠️  IMPORTANT: Please review the changes and test thoroughly!');
console.log('   - Check that all withTenant() wrappers were removed');
console.log('   - Verify business logic remains intact');
console.log('   - Test RLS still works correctly\n');
