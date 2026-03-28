import { describe, expect, it } from 'vitest';
import {
  defaultBranchNameGeneratorSettings,
  defaultCodeReviewSettings,
  defaultCommitMessageGeneratorSettings,
  defaultTodoPolishSettings,
} from '../defaults';
import { clearRemovedHttpConfigReferences } from '../httpConfigRefs';

const REMOVED_CONFIG_ID = 'removed-config-id';
const OTHER_CONFIG_ID = 'other-config-id';

describe('clearRemovedHttpConfigReferences', () => {
  it('clears all feature httpConfigId fields referencing removed config', () => {
    const state = {
      commitMessageGenerator: {
        ...defaultCommitMessageGeneratorSettings,
        provider: 'openai-http' as const,
        httpConfigId: REMOVED_CONFIG_ID,
      },
      codeReview: {
        ...defaultCodeReviewSettings,
        provider: 'openai-http' as const,
        httpConfigId: REMOVED_CONFIG_ID,
      },
      branchNameGenerator: {
        ...defaultBranchNameGeneratorSettings,
        provider: 'openai-http' as const,
        httpConfigId: REMOVED_CONFIG_ID,
      },
      todoPolish: {
        ...defaultTodoPolishSettings,
        provider: 'openai-http' as const,
        httpConfigId: REMOVED_CONFIG_ID,
      },
    };

    const result = clearRemovedHttpConfigReferences(state, REMOVED_CONFIG_ID);

    expect(result.commitMessageGenerator.httpConfigId).toBeUndefined();
    expect(result.codeReview.httpConfigId).toBeUndefined();
    expect(result.branchNameGenerator.httpConfigId).toBeUndefined();
    expect(result.todoPolish.httpConfigId).toBeUndefined();
  });

  it('keeps unrelated httpConfigId fields unchanged', () => {
    const state = {
      commitMessageGenerator: {
        ...defaultCommitMessageGeneratorSettings,
        provider: 'openai-http' as const,
        httpConfigId: OTHER_CONFIG_ID,
      },
      codeReview: {
        ...defaultCodeReviewSettings,
        provider: 'openai-http' as const,
      },
      branchNameGenerator: {
        ...defaultBranchNameGeneratorSettings,
        provider: 'openai-http' as const,
        httpConfigId: OTHER_CONFIG_ID,
      },
      todoPolish: {
        ...defaultTodoPolishSettings,
        provider: 'openai-http' as const,
      },
    };

    const result = clearRemovedHttpConfigReferences(state, REMOVED_CONFIG_ID);

    expect(result.commitMessageGenerator.httpConfigId).toBe(OTHER_CONFIG_ID);
    expect(result.codeReview.httpConfigId).toBeUndefined();
    expect(result.branchNameGenerator.httpConfigId).toBe(OTHER_CONFIG_ID);
    expect(result.todoPolish.httpConfigId).toBeUndefined();
  });
});
