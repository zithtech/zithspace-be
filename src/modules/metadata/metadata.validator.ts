import { ICore, APP_STRUCTURE } from '../../config/app-structure';

export class MetadataValidator {
  
  static validate(structure: ICore[]): void {
    const coreKeys = new Set<string>();
    const routeSet = new Set<string>();

    for (const core of structure) {
      if (coreKeys.has(core.key)) {
        throw new Error(`Duplicate core key found: ${core.key}`);
      }
      coreKeys.add(core.key);

      if (!core.modules) {
        throw new Error(`Core ${core.key} has no modules array defined.`);
      }

      const moduleKeys = new Set<string>();

      for (const module of core.modules) {
        if (moduleKeys.has(module.key)) {
          throw new Error(`Duplicate module key found in core ${core.key}: ${module.key}`);
        }
        moduleKeys.add(module.key);

        if (!module.pages) {
          throw new Error(`Module ${module.key} in core ${core.key} has no pages array defined.`);
        }

        for (const page of module.pages) {
          if (routeSet.has(page.route)) {
            throw new Error(`Duplicate route found: ${page.route}`);
          }
          routeSet.add(page.route);

          if (page.features) {
            const featureKeys = new Set<string>();
            const featureNames = new Set<string>();

            for (const feature of page.features) {
              if (featureKeys.has(feature.key)) {
                throw new Error(`Duplicate feature key found in page ${page.route}: ${feature.key}`);
              }
              featureKeys.add(feature.key);

              if (featureNames.has(feature.name)) {
                throw new Error(`Duplicate feature name found in page ${page.route}: ${feature.name}`);
              }
              featureNames.add(feature.name);

              if (feature.featureType !== 'PRIME' && feature.featureType !== 'GRID') {
                throw new Error(`Invalid featureType found in page ${page.route} for feature ${feature.key}: ${feature.featureType}. Allowed values are 'PRIME', 'GRID'.`);
              }
            }
          }
        }
      }
    }
  }

  static validateAppStructure(): void {
    this.validate(APP_STRUCTURE);
  }
}
