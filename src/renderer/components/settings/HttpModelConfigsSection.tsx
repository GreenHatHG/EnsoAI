import {
  DEFAULT_HTTP_AI_BASE_URL,
  DEFAULT_HTTP_AI_MODE,
  type HttpAIConfig,
  type HttpAIConfigTestRequest,
  type HttpAIConfigTestResult,
  type HttpAIRequestMode,
} from '@shared/types';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface HttpModelConfigsSectionProps {
  aiHttpConfigs: HttpAIConfig[];
  addHttpAIConfig: (config: HttpAIConfig) => void;
  updateHttpAIConfig: (id: string, updates: Partial<HttpAIConfig>) => void;
  removeHttpAIConfig: (id: string) => void;
}

const HTTP_MODE_OPTIONS: { value: HttpAIRequestMode; label: string }[] = [
  { value: 'responses', label: 'responses' },
  { value: 'chat_completions', label: 'chat_completions' },
];

const HTTP_CONFIG_TEST_UNKNOWN_ERROR = '未知错误';
const HTTP_CONFIG_TEST_SUCCESS_TEXT = '接口可用';
const HTTP_CONFIG_REQUIRED_KEY_ERROR = '请先填写 API Key';
const HTTP_CONFIG_REQUIRED_MODEL_ERROR = '请先填写 Model';
const HTTP_CONFIG_EXTRA_BODY_INVALID_ERROR = '自定义参数必须是 JSON 对象';
const HTTP_CONFIG_EXTRA_BODY_HINT =
  'JSON 对象，会合并到请求 body，可覆盖 model/input/messages/stream';
const HTTP_CONFIG_EXTRA_BODY_PLACEHOLDER = '{"reasoning_effort":"medium"}';
const HTTP_CONFIG_EDIT_ACTION_TEXT = 'Edit';
const HTTP_CONFIG_REMOVE_ACTION_TEXT = 'Remove';
const HTTP_CONFIG_ADD_ACTION_TEXT = 'Add Config';
const HTTP_CONFIG_SAVE_ACTION_TEXT = 'Save Config';
const HTTP_CONFIG_CANCEL_EDIT_ACTION_TEXT = 'Cancel Edit';
const HTTP_CONFIG_TEST_ACTION_TEXT = '测试';
const HTTP_CONFIG_TESTING_TEXT = '测试中...';
const HTTP_CONFIG_TEST_DRAFT_ACTION_TEXT = '测试配置';
const HTTP_CONFIG_NAME_PLACEHOLDER = 'Config name (optional)';
const HTTP_CONFIG_BASE_URL_LABEL = 'Base URL';
const HTTP_CONFIG_BASE_URL_HINT = '默认官方地址，可填代理或兼容服务地址';
const HTTP_CONFIG_KEY_LABEL = 'API Key';
const HTTP_CONFIG_KEY_PLACEHOLDER = 'API key (required)';
const HTTP_CONFIG_MODEL_LABEL = 'Model';
const HTTP_CONFIG_MODEL_PLACEHOLDER = 'Model (required)';
const HTTP_CONFIG_NAME_LABEL = '配置名';
const HTTP_CONFIG_MODE_LABEL = 'Mode';
const HTTP_CONFIG_EXTRA_BODY_LABEL = 'Extra Body (JSON)';
const HTTP_CONFIG_EMPTY_TEXT = 'No HTTP model config yet.';
const HTTP_CONFIG_LIST_TITLE = '已保存配置';
const HTTP_CONFIG_DESCRIPTION = 'key 和 model 必填，mode 默认 responses，base_url 默认官方地址';
const HTTP_CONFIG_LIST_COUNT_SUFFIX = '条';
const HTTP_CONFIG_EDITING_BADGE_TEXT = '编辑中';
const HTTP_CONFIG_LIST_MODEL_PREFIX = 'Model';
const HTTP_CONFIG_LIST_BASE_URL_PREFIX = 'Base URL';
const HTTP_CONFIG_DRAFT_STATUS_TITLE = '本次测试结果';
const HTTP_CONFIG_DRAFT_TESTING_TITLE = '正在测试';
const HTTP_CONFIG_DRAFT_TESTING_DESC = '正在连接接口，请稍等...';
const HTTP_CONFIG_DRAFT_SUCCESS_TITLE = '测试成功';
const HTTP_CONFIG_DRAFT_FAILURE_TITLE = '测试失败';
const HTTP_CONFIG_DRAFT_LATENCY_LABEL = '耗时';
const HTTP_CONFIG_JSON_ERROR_TITLE = 'Extra Body 格式错误';
const HTTP_CONFIG_ITEM_TESTING_TITLE = '正在测试这条配置';
const HTTP_CONFIG_ITEM_TESTING_DESC = '测试完成后会在这里显示结果';
const HTTP_CONFIG_ITEM_SUCCESS_TITLE = '最近一次测试成功';
const HTTP_CONFIG_ITEM_FAILURE_TITLE = '最近一次测试失败';

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseHttpExtraBody(value: string): {
  extraBody?: Record<string, unknown>;
  error?: string;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!isRecordObject(parsed)) {
      return { error: HTTP_CONFIG_EXTRA_BODY_INVALID_ERROR };
    }
    return { extraBody: parsed };
  } catch {
    return { error: HTTP_CONFIG_EXTRA_BODY_INVALID_ERROR };
  }
}

function stringifyHttpExtraBody(extraBody: Record<string, unknown> | undefined): string {
  if (!extraBody || Object.keys(extraBody).length === 0) {
    return '';
  }
  return JSON.stringify(extraBody, null, 2);
}

function formatHttpConfigTestResult(result: HttpAIConfigTestResult): string {
  if (result.success) {
    return result.latency !== undefined
      ? `${HTTP_CONFIG_TEST_SUCCESS_TEXT}，${HTTP_CONFIG_DRAFT_LATENCY_LABEL} ${result.latency}ms`
      : HTTP_CONFIG_TEST_SUCCESS_TEXT;
  }
  return result.error ?? HTTP_CONFIG_TEST_UNKNOWN_ERROR;
}

export function HttpModelConfigsSection({
  aiHttpConfigs,
  addHttpAIConfig,
  updateHttpAIConfig,
  removeHttpAIConfig,
}: HttpModelConfigsSectionProps) {
  const [httpName, setHttpName] = useState('');
  const [httpBaseUrl, setHttpBaseUrl] = useState(DEFAULT_HTTP_AI_BASE_URL);
  const [httpKey, setHttpKey] = useState('');
  const [httpModel, setHttpModel] = useState('');
  const [httpExtraBody, setHttpExtraBody] = useState('');
  const [httpExtraBodyError, setHttpExtraBodyError] = useState<string | null>(null);
  const [httpMode, setHttpMode] = useState<HttpAIRequestMode>(DEFAULT_HTTP_AI_MODE);
  const [httpDraftTestResult, setHttpDraftTestResult] = useState<HttpAIConfigTestResult | null>(
    null
  );
  const [httpDraftTesting, setHttpDraftTesting] = useState(false);
  const [editingHttpConfigId, setEditingHttpConfigId] = useState<string | null>(null);
  const [testingSavedHttpConfigId, setTestingSavedHttpConfigId] = useState<string | null>(null);
  const [savedHttpConfigTestResults, setSavedHttpConfigTestResults] = useState<
    Record<string, HttpAIConfigTestResult | undefined>
  >({});

  const clearHttpDraftTestResult = () => {
    setHttpDraftTestResult(null);
    setHttpExtraBodyError(null);
  };

  const clearSavedHttpConfigTestResult = (id: string) => {
    setSavedHttpConfigTestResults((prev) => {
      if (!prev[id]) {
        return prev;
      }
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const resetHttpDraftForm = () => {
    setHttpName('');
    setHttpBaseUrl(DEFAULT_HTTP_AI_BASE_URL);
    setHttpKey('');
    setHttpModel('');
    setHttpExtraBody('');
    setHttpMode(DEFAULT_HTTP_AI_MODE);
    setEditingHttpConfigId(null);
    clearHttpDraftTestResult();
  };

  const buildHttpConfigTestRequest = (config: {
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    mode?: HttpAIRequestMode;
    extraBody?: Record<string, unknown>;
  }): HttpAIConfigTestRequest => ({
    name: config.name,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    mode: config.mode,
    extraBody: config.extraBody,
  });

  const handleTestDraftHttpConfig = async () => {
    if (!httpKey.trim()) {
      setHttpDraftTestResult({
        success: false,
        error: HTTP_CONFIG_REQUIRED_KEY_ERROR,
      });
      return;
    }
    if (!httpModel.trim()) {
      setHttpDraftTestResult({
        success: false,
        error: HTTP_CONFIG_REQUIRED_MODEL_ERROR,
      });
      return;
    }
    const parsedExtraBody = parseHttpExtraBody(httpExtraBody);
    if (parsedExtraBody.error) {
      setHttpExtraBodyError(parsedExtraBody.error);
      return;
    }
    setHttpExtraBodyError(null);

    setHttpDraftTesting(true);
    try {
      const result = await window.electronAPI.app.testHttpAIConfig(
        buildHttpConfigTestRequest({
          name: httpName,
          baseUrl: httpBaseUrl,
          apiKey: httpKey,
          model: httpModel,
          mode: httpMode,
          extraBody: parsedExtraBody.extraBody,
        })
      );
      setHttpDraftTestResult(result);
    } catch (error) {
      setHttpDraftTestResult({
        success: false,
        error: error instanceof Error ? error.message : HTTP_CONFIG_TEST_UNKNOWN_ERROR,
      });
    } finally {
      setHttpDraftTesting(false);
    }
  };

  const handleTestSavedHttpConfig = async (config: HttpAIConfig) => {
    setTestingSavedHttpConfigId(config.id);
    try {
      const result = await window.electronAPI.app.testHttpAIConfig(
        buildHttpConfigTestRequest({
          name: config.name,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          mode: config.mode,
          extraBody: config.extraBody,
        })
      );
      setSavedHttpConfigTestResults((prev) => ({
        ...prev,
        [config.id]: result,
      }));
    } catch (error) {
      setSavedHttpConfigTestResults((prev) => ({
        ...prev,
        [config.id]: {
          success: false,
          error: error instanceof Error ? error.message : HTTP_CONFIG_TEST_UNKNOWN_ERROR,
        },
      }));
    } finally {
      setTestingSavedHttpConfigId(null);
    }
  };

  const handleRemoveHttpConfig = (id: string) => {
    removeHttpAIConfig(id);
    clearSavedHttpConfigTestResult(id);
    if (testingSavedHttpConfigId === id) {
      setTestingSavedHttpConfigId(null);
    }
    if (editingHttpConfigId === id) {
      resetHttpDraftForm();
    }
  };

  const handleEditHttpConfig = (config: HttpAIConfig) => {
    setEditingHttpConfigId(config.id);
    setHttpName(config.name);
    setHttpBaseUrl(config.baseUrl);
    setHttpKey(config.apiKey);
    setHttpModel(config.model);
    setHttpMode(config.mode || DEFAULT_HTTP_AI_MODE);
    setHttpExtraBody(stringifyHttpExtraBody(config.extraBody));
    clearHttpDraftTestResult();
  };

  const handleSaveHttpConfig = () => {
    const trimmedKey = httpKey.trim();
    const trimmedModel = httpModel.trim();
    if (!trimmedKey || !trimmedModel) {
      return;
    }
    const parsedExtraBody = parseHttpExtraBody(httpExtraBody);
    if (parsedExtraBody.error) {
      setHttpExtraBodyError(parsedExtraBody.error);
      return;
    }
    setHttpExtraBodyError(null);

    const editingConfig = editingHttpConfigId
      ? aiHttpConfigs.find((item) => item.id === editingHttpConfigId)
      : undefined;
    if (editingHttpConfigId && !editingConfig) {
      resetHttpDraftForm();
      return;
    }

    const fallbackName = editingConfig?.name || `HTTP-${aiHttpConfigs.length + 1}`;
    const payload: HttpAIConfig = {
      id: editingConfig?.id || crypto.randomUUID(),
      name: httpName.trim() || fallbackName,
      baseUrl: (httpBaseUrl.trim() || DEFAULT_HTTP_AI_BASE_URL).replace(/\/+$/, ''),
      apiKey: trimmedKey,
      model: trimmedModel,
      mode: httpMode || DEFAULT_HTTP_AI_MODE,
      extraBody: parsedExtraBody.extraBody,
      enabled: editingConfig?.enabled ?? true,
    };

    if (editingConfig) {
      updateHttpAIConfig(editingConfig.id, payload);
      clearSavedHttpConfigTestResult(editingConfig.id);
      if (testingSavedHttpConfigId === editingConfig.id) {
        setTestingSavedHttpConfigId(null);
      }
    } else {
      addHttpAIConfig(payload);
    }
    resetHttpDraftForm();
  };

  const draftActionDisabled = !httpKey.trim() || !httpModel.trim();
  const showDraftStatusArea = Boolean(
    httpExtraBodyError || httpDraftTesting || httpDraftTestResult
  );

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>HTTP Model Configs</CardTitle>
          <Badge size="sm" variant="outline">
            {aiHttpConfigs.length} {HTTP_CONFIG_LIST_COUNT_SUFFIX}
          </Badge>
          {editingHttpConfigId && (
            <Badge size="sm" variant="warning">
              {HTTP_CONFIG_EDITING_BADGE_TEXT}
            </Badge>
          )}
        </div>
        <CardDescription>{HTTP_CONFIG_DESCRIPTION}</CardDescription>
      </CardHeader>

      <CardPanel className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field className="min-w-0">
            <FieldLabel>{HTTP_CONFIG_NAME_LABEL}</FieldLabel>
            <Input
              value={httpName}
              onChange={(event) => {
                setHttpName(event.target.value);
                clearHttpDraftTestResult();
              }}
              placeholder={HTTP_CONFIG_NAME_PLACEHOLDER}
            />
          </Field>

          <Field className="min-w-0">
            <FieldLabel>{HTTP_CONFIG_BASE_URL_LABEL}</FieldLabel>
            <Input
              value={httpBaseUrl}
              onChange={(event) => {
                setHttpBaseUrl(event.target.value);
                clearHttpDraftTestResult();
              }}
              placeholder={DEFAULT_HTTP_AI_BASE_URL}
            />
            <FieldDescription>{HTTP_CONFIG_BASE_URL_HINT}</FieldDescription>
          </Field>

          <Field className="min-w-0">
            <FieldLabel>{HTTP_CONFIG_KEY_LABEL}</FieldLabel>
            <Input
              type="password"
              value={httpKey}
              onChange={(event) => {
                setHttpKey(event.target.value);
                clearHttpDraftTestResult();
              }}
              placeholder={HTTP_CONFIG_KEY_PLACEHOLDER}
            />
          </Field>

          <Field className="min-w-0">
            <FieldLabel>{HTTP_CONFIG_MODEL_LABEL}</FieldLabel>
            <Input
              value={httpModel}
              onChange={(event) => {
                setHttpModel(event.target.value);
                clearHttpDraftTestResult();
              }}
              placeholder={HTTP_CONFIG_MODEL_PLACEHOLDER}
            />
          </Field>

          <Field className="min-w-0 lg:col-span-2">
            <FieldLabel>{HTTP_CONFIG_EXTRA_BODY_LABEL}</FieldLabel>
            <Textarea
              value={httpExtraBody}
              onChange={(event) => {
                setHttpExtraBody(event.target.value);
                clearHttpDraftTestResult();
              }}
              aria-invalid={Boolean(httpExtraBodyError)}
              className="min-h-28 font-mono text-xs"
              placeholder={HTTP_CONFIG_EXTRA_BODY_PLACEHOLDER}
            />
            <FieldDescription>{HTTP_CONFIG_EXTRA_BODY_HINT}</FieldDescription>
          </Field>

          <Field className="min-w-0 sm:max-w-xs">
            <FieldLabel>{HTTP_CONFIG_MODE_LABEL}</FieldLabel>
            <Select
              value={httpMode}
              onValueChange={(value) => {
                setHttpMode(value as HttpAIRequestMode);
                clearHttpDraftTestResult();
              }}
            >
              <SelectTrigger>
                <SelectValue>{httpMode}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {HTTP_MODE_OPTIONS.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleTestDraftHttpConfig()}
            disabled={draftActionDisabled || httpDraftTesting}
          >
            {httpDraftTesting ? HTTP_CONFIG_TESTING_TEXT : HTTP_CONFIG_TEST_DRAFT_ACTION_TEXT}
          </Button>
          <Button type="button" onClick={handleSaveHttpConfig} disabled={draftActionDisabled}>
            {editingHttpConfigId ? HTTP_CONFIG_SAVE_ACTION_TEXT : HTTP_CONFIG_ADD_ACTION_TEXT}
          </Button>
          {editingHttpConfigId && (
            <Button type="button" variant="ghost" onClick={resetHttpDraftForm}>
              {HTTP_CONFIG_CANCEL_EDIT_ACTION_TEXT}
            </Button>
          )}
        </div>

        {showDraftStatusArea && (
          <div aria-live="polite" className="space-y-2">
            {httpExtraBodyError && (
              <Alert variant="error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{HTTP_CONFIG_JSON_ERROR_TITLE}</AlertTitle>
                <AlertDescription className="break-all text-foreground">
                  {httpExtraBodyError}
                </AlertDescription>
              </Alert>
            )}

            {httpDraftTesting && (
              <Alert variant="info">
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>{HTTP_CONFIG_DRAFT_TESTING_TITLE}</AlertTitle>
                <AlertDescription>{HTTP_CONFIG_DRAFT_TESTING_DESC}</AlertDescription>
              </Alert>
            )}

            {!httpDraftTesting && httpDraftTestResult && (
              <Alert variant={httpDraftTestResult.success ? 'success' : 'error'}>
                {httpDraftTestResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertTitle>
                  {HTTP_CONFIG_DRAFT_STATUS_TITLE} ·{' '}
                  {httpDraftTestResult.success
                    ? HTTP_CONFIG_DRAFT_SUCCESS_TITLE
                    : HTTP_CONFIG_DRAFT_FAILURE_TITLE}
                </AlertTitle>
                <AlertDescription className="break-all text-foreground">
                  {formatHttpConfigTestResult(httpDraftTestResult)}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="space-y-2 border-t pt-4">
          <p className="font-medium text-sm">{HTTP_CONFIG_LIST_TITLE}</p>
          {aiHttpConfigs.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-4 text-muted-foreground text-xs">
              {HTTP_CONFIG_EMPTY_TEXT}
            </div>
          ) : (
            aiHttpConfigs.map((item) => {
              const itemTestResult = savedHttpConfigTestResults[item.id];
              const itemTesting = testingSavedHttpConfigId === item.id;

              return (
                <div key={item.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate font-medium text-sm">{item.name}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge size="sm" variant="outline">
                          {HTTP_CONFIG_LIST_MODEL_PREFIX}: {item.model}
                        </Badge>
                        <Badge size="sm" variant="outline">
                          {item.mode}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => handleEditHttpConfig(item)}
                        disabled={itemTesting}
                      >
                        {HTTP_CONFIG_EDIT_ACTION_TEXT}
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => void handleTestSavedHttpConfig(item)}
                        disabled={itemTesting}
                      >
                        {itemTesting ? HTTP_CONFIG_TESTING_TEXT : HTTP_CONFIG_TEST_ACTION_TEXT}
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive-outline"
                        onClick={() => handleRemoveHttpConfig(item.id)}
                        disabled={itemTesting}
                      >
                        {HTTP_CONFIG_REMOVE_ACTION_TEXT}
                      </Button>
                    </div>
                  </div>

                  <p className="break-all text-muted-foreground text-xs">
                    {HTTP_CONFIG_LIST_BASE_URL_PREFIX}: {item.baseUrl}
                  </p>

                  {itemTesting && (
                    <Alert variant="info">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <AlertTitle>{HTTP_CONFIG_ITEM_TESTING_TITLE}</AlertTitle>
                      <AlertDescription>{HTTP_CONFIG_ITEM_TESTING_DESC}</AlertDescription>
                    </Alert>
                  )}

                  {!itemTesting && itemTestResult && (
                    <Alert variant={itemTestResult.success ? 'success' : 'error'}>
                      {itemTestResult.success ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                      <AlertTitle>
                        {itemTestResult.success
                          ? HTTP_CONFIG_ITEM_SUCCESS_TITLE
                          : HTTP_CONFIG_ITEM_FAILURE_TITLE}
                      </AlertTitle>
                      <AlertDescription className="break-all text-foreground">
                        {formatHttpConfigTestResult(itemTestResult)}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardPanel>
    </Card>
  );
}
