import { MetadataService } from '@/modules/metadata/metadata.service';
import { syncLogger } from '@/utils/logger';

export class NavigationService {
  /**
   * Generates the dynamic navigation tree by filtering the global metadata tree.
   * Nodes are included ONLY if their key satisfies BOTH the user's RBAC permissions
   * and the tenant's Subscription features.
   * 
   * @param rbacPermissions Set of allowed RBAC permission names (metadata keys)
   * @param subscriptionFeatures Array of allowed subscription feature IDs (metadata keys)
   */
  async buildNavigation(rbacPermissions: Set<string>, subscriptionFeatures: string[]): Promise<any[]> {
    try {
      // Create sets for O(1) lookups
      const allowedFeatures = new Set(subscriptionFeatures);
      const allowedPermissions = rbacPermissions;

      // Helper to check if a key is allowed by BOTH Subscription and RBAC
      const isAllowed = (key: string) => {
        return allowedFeatures.has(key) && allowedPermissions.has(key);
      };

      // 1. Fetch full metadata tree
      const fullTree = await MetadataService.getMetadataTree();

      // 2. Filter tree hierarchically
      const filteredTree = fullTree.map((core: any) => {
        // We assume Cores are not strictly permissioned individually, but if they are, check isAllowed(core.key)
        // If they are allowed implicitly by having allowed children, we keep them.
        
        const filteredModules = core.modules.map((mod: any) => {
          
          const filteredPages = mod.pages.map((page: any) => {
            
            // Only keep features that satisfy both rules
            const filteredPageFeatures = page.features.filter((feat: any) => isAllowed(feat.key));
            
            return {
              ...page,
              features: filteredPageFeatures
            };
          }).filter((page: any) => {
             // A page is only kept if the page itself is allowed
             return isAllowed(page.key);
          });

          return {
            ...mod,
            pages: filteredPages
          };
        }).filter((mod: any) => {
           // Keep module if it has any valid pages, or if the module itself is explicitly allowed
           // Assuming module visibility depends on its pages for now, or if a module has a specific permission.
           return mod.pages.length > 0 || isAllowed(mod.key);
        });

        return {
          ...core,
          modules: filteredModules
        };
      }).filter((core: any) => core.modules.length > 0);

      return filteredTree;
    } catch (error) {
      syncLogger.error(`[NavigationService] Error building navigation tree`, error);
      return [];
    }
  }
}

export const navigationService = new NavigationService();
