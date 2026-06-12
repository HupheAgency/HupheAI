import type { ProjectAssetRef, ProjectCopyRef } from './atelier-project-store'
import type { AtelierCreationType } from '../components/AtelierCreationModeButtons'

export interface CrossFormatSeed {
  targetType: AtelierCreationType
  assetRefs: ProjectAssetRef[]
  copyRefs: ProjectCopyRef[]
}

export function buildProjectFromRefs(
  targetType: AtelierCreationType,
  assetRefs: ProjectAssetRef[] = [],
  copyRefs: ProjectCopyRef[] = [],
): CrossFormatSeed {
  return {
    targetType,
    assetRefs: [...assetRefs],
    copyRefs: [...copyRefs],
  }
}
