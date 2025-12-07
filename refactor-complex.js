const fs = require('fs');
const path = require('path');

/**
 * Advanced refactoring script to handle complex withTenant() patterns
 * This handles multi-statement blocks that the first script missed
 */

const controllersToRefactor = [
  'settingsController.ts',
  'userController.ts',
  'projectController.ts'
];

const controllersPath = path.join(__dirname, 'src', 'controllers');

function refactorComplexPatterns(filePath) {
  console.log(`\n🔧 Advanced refactoring: ${path.basename(filePath)}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changeCount = 0;

  // Pattern: Multi-line withTenant blocks
  // await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
  //   ... multiple statements ...
  // });
  
  const regex = /await\s+tenantAwarePrisma\.withTenant\s*\(\s*req\.tenantId\s*,\s*async\s*\(\s*client\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\);/g;
  
  let match;
  const replacements = [];
  
  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0];
    const innerCode = match[1];
    
    // Replace client. with prisma.
    const refactoredCode = innerCode.replace(/client\./g, 'prisma.');
    
    replacements.push({
      original: fullMatch,
      replacement: refactoredCode.trim()
    });
    
    changeCount++;
  }
  
  // Apply replacements in reverse order to maintain indices
  replacements.reverse().forEach(({ original, replacement }) => {
    content = content.replace(original, replacement);
  });
  
  if (changeCount > 0) {
    console.log(`  ✓ Unflattened ${changeCount} complex withTenant blocks`);
  }
  
  // Pattern 2: Handle cases without await at the start
  // const result = tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
  const regex2 = /=\s*tenantAwarePrisma\.withTenant\s*\(\s*req\.tenantId\s*,\s*async\s*\(\s*client\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\);/g;
  
  let match2;
  const replacements2 = [];
  
  while ((match2 = regex2.exec(content)) !== null) {
    const fullMatch = match2[0];
    const innerCode = match2[1];
    
    // For assignment cases, we need to keep the structure but unflatten
    // This is trickier - we'll extract the return value
    const returnMatch = innerCode.match(/return\s+([\s\S]+);?\s*$/);
    
    if (returnMatch) {
      // Simple return case
      const returnValue = returnMatch[1].replace(/client\./g, 'prisma.');
      replacements2.push({
        original: fullMatch,
        replacement: `= ${returnValue};`
      });
    } else {
      // Complex case - need to unflatten
      const refactoredCode = innerCode.replace(/client\./g, 'prisma.');
      replacements2.push({
        original: fullMatch,
        replacement: `; ${refactoredCode.trim()}`
      });
    }
    
    changeCount++;
  }
  
  replacements2.reverse().forEach(({ original, replacement }) => {
    content = content.replace(original, replacement);
  });
  
  if (replacements2.length > 0) {
    console.log(`  ✓ Fixed ${replacements2.length} assignment withTenant patterns`);
  }

  // Write back
  fs.writeFileSync(filePath, content, 'utf8');
  
  // Check remaining
  const remainingCount = (content.match(/tenantAwarePrisma\.withTenant/g) || []).length;
  if (remainingCount > 0) {
    console.log(`  ⚠️  Warning: ${remainingCount} tenantAwarePrisma.withTenant references still remain`);
  } else {
    console.log(`  ✅ All withTenant calls removed!`);
  }
  
  console.log(`  📊 Total changes: ${changeCount}`);
  
  return changeCount;
}

// Main execution
console.log('🚀 Starting advanced controller refactoring...\n');
console.log('Target controllers:', controllersToRefactor.join(', '));

let totalChanges = 0;

controllersToRefactor.forEach(filename => {
  const filePath = path.join(controllersPath, filename);
  
  if (fs.existsSync(filePath)) {
    try {
      const changes = refactorComplexPatterns(filePath);
      totalChanges += changes;
    } catch (error) {
      console.error(`  ❌ Error refactoring ${filename}:`, error.message);
    }
  } else {
    console.log(`  ⚠️  File not found: ${filename}`);
  }
});

console.log(`\n✨ Advanced refactoring complete! Total changes: ${totalChanges}`);
console.log('\n⚠️  IMPORTANT: Review the changes carefully!');
console.log('   The code structure has been unflattened.');
console.log('   Make sure to check for any syntax errors.\n');
