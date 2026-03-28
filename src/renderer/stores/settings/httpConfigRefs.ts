import type { SettingsState } from './types';

type HttpConfigReferenceSettings = Pick<
  SettingsState,
  'commitMessageGenerator' | 'codeReview' | 'branchNameGenerator' | 'todoPolish'
>;

function clearHttpConfigId<T extends { httpConfigId?: string }>(
  settings: T,
  removedConfigId: string
): T {
  if (settings.httpConfigId !== removedConfigId) {
    return settings;
  }
  return {
    ...settings,
    httpConfigId: undefined,
  };
}

export function clearRemovedHttpConfigReferences(
  settings: HttpConfigReferenceSettings,
  removedConfigId: string
): HttpConfigReferenceSettings {
  return {
    commitMessageGenerator: clearHttpConfigId(settings.commitMessageGenerator, removedConfigId),
    codeReview: clearHttpConfigId(settings.codeReview, removedConfigId),
    branchNameGenerator: clearHttpConfigId(settings.branchNameGenerator, removedConfigId),
    todoPolish: clearHttpConfigId(settings.todoPolish, removedConfigId),
  };
}
