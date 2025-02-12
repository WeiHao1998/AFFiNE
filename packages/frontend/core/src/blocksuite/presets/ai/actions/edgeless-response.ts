import type { EditorHost } from '@blocksuite/block-std';
import type {
  AffineAIPanelWidget,
  AIItemConfig,
  EdgelessCopilotWidget,
  EdgelessElementToolbarWidget,
  EdgelessRootService,
  MindmapElementModel,
  ShapeElementModel,
  SurfaceBlockModel,
} from '@blocksuite/blocks';
import {
  DeleteIcon,
  EDGELESS_ELEMENT_TOOLBAR_WIDGET,
  EmbedHtmlBlockSpec,
  fitContent,
  ImageBlockModel,
  InsertBelowIcon,
  NoteDisplayMode,
  ResetIcon,
} from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import type { TemplateResult } from 'lit';

import { AIPenIcon, ChatWithAIIcon } from '../_common/icons';
import { insertFromMarkdown } from '../_common/markdown-utils';
import { getSurfaceElementFromEditor } from '../_common/selection-utils';
import { getAIPanel } from '../ai-panel';
import { AIProvider } from '../provider';
import { reportResponse } from '../utils/action-reporter';
import {
  getEdgelessCopilotWidget,
  getService,
  isMindMapRoot,
} from '../utils/edgeless';
import { preprocessHtml } from '../utils/html';
import { fetchImageToFile } from '../utils/image';
import {
  getCopilotSelectedElems,
  getEdgelessRootFromEditor,
  getEdgelessService,
} from '../utils/selection-utils';
import { EXCLUDING_INSERT_ACTIONS, generatingStages } from './consts';
import type { CtxRecord } from './types';

type FinishConfig = Exclude<
  AffineAIPanelWidget['config'],
  null
>['finishStateConfig'];

type ErrorConfig = Exclude<
  AffineAIPanelWidget['config'],
  null
>['errorStateConfig'];

export function getElementToolbar(
  host: EditorHost
): EdgelessElementToolbarWidget {
  const rootBlockId = host.doc.root?.id as string;
  const elementToolbar = host.view.getWidget(
    EDGELESS_ELEMENT_TOOLBAR_WIDGET,
    rootBlockId
  ) as EdgelessElementToolbarWidget;

  return elementToolbar;
}

export function getTriggerEntry(host: EditorHost) {
  const copilotWidget = getEdgelessCopilotWidget(host);

  return copilotWidget.visible ? 'selection' : 'toolbar';
}

export function discard(
  panel: AffineAIPanelWidget,
  _: EdgelessCopilotWidget
): AIItemConfig {
  return {
    name: 'Discard',
    icon: DeleteIcon,
    showWhen: () => !!panel.answer,
    handler: () => {
      panel.discard();
    },
  };
}

export function retry(panel: AffineAIPanelWidget): AIItemConfig {
  return {
    name: 'Retry',
    icon: ResetIcon,
    handler: () => {
      reportResponse('result:retry');
      panel.generate();
    },
  };
}

export function createInsertResp<T extends keyof BlockSuitePresets.AIActions>(
  id: T,
  handler: (host: EditorHost, ctx: CtxRecord) => void,
  host: EditorHost,
  ctx: CtxRecord,
  buttonText: string = 'Insert below'
): AIItemConfig {
  return {
    name: buttonText,
    icon: InsertBelowIcon,
    showWhen: () => {
      const panel = getAIPanel(host);
      return !EXCLUDING_INSERT_ACTIONS.includes(id) && !!panel.answer;
    },
    handler: () => {
      reportResponse('result:insert');
      handler(host, ctx);
      const panel = getAIPanel(host);
      panel.hide();
    },
  };
}

export function asCaption<T extends keyof BlockSuitePresets.AIActions>(
  id: T,
  host: EditorHost
): AIItemConfig {
  return {
    name: 'Use as caption',
    icon: AIPenIcon,
    showWhen: () => {
      const panel = getAIPanel(host);
      return id === 'generateCaption' && !!panel.answer;
    },
    handler: () => {
      reportResponse('result:use-as-caption');
      const panel = getAIPanel(host);
      const caption = panel.answer;
      if (!caption) return;

      const selectedElements = getCopilotSelectedElems(host);
      if (selectedElements.length !== 1) return;

      const imageBlock = selectedElements[0];
      if (!(imageBlock instanceof ImageBlockModel)) return;

      host.doc.updateBlock(imageBlock, { caption });
      panel.hide();
    },
  };
}

type MindMapNode = {
  text: string;
  children: MindMapNode[];
};

const defaultHandler = (host: EditorHost) => {
  const doc = host.doc;
  const panel = getAIPanel(host);
  const edgelessCopilot = getEdgelessCopilotWidget(host);
  const bounds = edgelessCopilot.determineInsertionBounds(800, 95);

  doc.transact(() => {
    assertExists(doc.root);
    const noteBlockId = doc.addBlock(
      'affine:note',
      {
        xywh: bounds.serialize(),
        displayMode: NoteDisplayMode.EdgelessOnly,
      },
      doc.root.id
    );

    assertExists(panel.answer);
    insertFromMarkdown(host, panel.answer, noteBlockId)
      .then(() => {
        const service = getService(host);

        service.selection.set({
          elements: [noteBlockId],
          editing: false,
        });
      })
      .catch(err => {
        console.error(err);
      });
  });
};

const imageHandler = (host: EditorHost) => {
  const aiPanel = getAIPanel(host);
  // `DataURL` or `URL`
  const data = aiPanel.answer;
  if (!data) return;

  const edgelessCopilot = getEdgelessCopilotWidget(host);
  const bounds = edgelessCopilot.determineInsertionBounds();

  edgelessCopilot.hideCopilotPanel();
  aiPanel.hide();

  const filename = 'image';
  const imageProxy = host.std.clipboard.configs.get('imageProxy');

  fetchImageToFile(data, filename, imageProxy)
    .then(img => {
      if (!img) return;

      const edgelessRoot = getEdgelessRootFromEditor(host);
      const { minX, minY } = bounds;
      const [x, y] = edgelessRoot.service.viewport.toViewCoord(minX, minY);

      host.doc.transact(() => {
        edgelessRoot.addImages([img], [x, y], true).catch(console.error);
      });
    })
    .catch(console.error);
};

export const responses: {
  [key in keyof Partial<BlockSuitePresets.AIActions>]: (
    host: EditorHost,
    ctx: CtxRecord
  ) => void;
} = {
  expandMindmap: (host, ctx) => {
    const [surface] = host.doc.getBlockByFlavour(
      'affine:surface'
    ) as SurfaceBlockModel[];

    const elements = ctx.get()[
      'selectedElements'
    ] as BlockSuite.EdgelessModelType[];
    const data = ctx.get() as {
      node: MindMapNode;
    };

    queueMicrotask(() => {
      getAIPanel(host).hide();
    });

    const mindmap = elements[0].group as MindmapElementModel;

    if (!data?.node) return;

    if (data.node.children) {
      data.node.children.forEach(childTree => {
        mindmap.addTree(elements[0].id, childTree);
      });

      const subtree = mindmap.getNode(elements[0].id);

      if (!subtree) return;

      surface.doc.transact(() => {
        const updateNodeSize = (node: typeof subtree) => {
          fitContent(node.element as ShapeElementModel);

          node.children.forEach(child => {
            updateNodeSize(child);
          });
        };

        updateNodeSize(subtree);
      });

      setTimeout(() => {
        const edgelessService = getEdgelessService(host);

        edgelessService.selection.set({
          elements: [subtree.element.id],
          editing: false,
        });
      });
    }
  },
  brainstormMindmap: (host, ctx) => {
    const aiPanel = getAIPanel(host);
    const edgelessService = getEdgelessService(host);
    const edgelessCopilot = getEdgelessCopilotWidget(host);
    const selectionRect = edgelessCopilot.selectionModelRect;
    const [surface] = host.doc.getBlockByFlavour(
      'affine:surface'
    ) as SurfaceBlockModel[];
    const elements = ctx.get()[
      'selectedElements'
    ] as BlockSuite.EdgelessModelType[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = ctx.get() as any;
    let newGenerated = true;

    // This means regenerate
    if (isMindMapRoot(elements[0])) {
      const mindmap = elements[0].group as MindmapElementModel;
      const xywh = mindmap.tree.element.xywh;

      surface.removeElement(mindmap.id);

      if (data.node) {
        data.node.xywh = xywh;
        newGenerated = false;
      }
    }

    edgelessCopilot.hideCopilotPanel();
    aiPanel.hide();

    const mindmapId = surface.addElement({
      type: 'mindmap',
      children: data.node,
      style: data.style,
    });
    const mindmap = surface.getElementById(mindmapId) as MindmapElementModel;

    host.doc.transact(() => {
      mindmap.childElements.forEach(shape => {
        fitContent(shape as ShapeElementModel);
      });
    });

    edgelessService.telemetryService?.track('CanvasElementAdded', {
      control: 'ai',
      page: 'whiteboard editor',
      module: 'toolbar',
      segment: 'toolbar',
      type: 'mindmap',
    });

    queueMicrotask(() => {
      if (newGenerated && selectionRect) {
        mindmap.moveTo([
          selectionRect.x,
          selectionRect.y,
          selectionRect.width,
          selectionRect.height,
        ]);
      }
    });

    // This is a workaround to make sure mindmap and other microtask are done
    setTimeout(() => {
      edgelessService.viewport.setViewportByBound(
        mindmap.elementBound,
        [20, 20, 20, 20],
        true
      );

      edgelessService.selection.set({
        elements: [mindmap.tree.element.id],
        editing: false,
      });
    });
  },
  makeItReal: (host, ctx) => {
    const aiPanel = getAIPanel(host);
    let html = aiPanel.answer;
    if (!html) return;
    html = preprocessHtml(html);

    const edgelessCopilot = getEdgelessCopilotWidget(host);
    const [surface] = host.doc.getBlockByFlavour(
      'affine:surface'
    ) as SurfaceBlockModel[];

    const data = ctx.get();
    const bounds = edgelessCopilot.determineInsertionBounds(
      (data['width'] as number) || 800,
      (data['height'] as number) || 600
    );

    edgelessCopilot.hideCopilotPanel();
    aiPanel.hide();

    const edgelessRoot = getEdgelessRootFromEditor(host);

    host.doc.transact(() => {
      edgelessRoot.doc.addBlock(
        EmbedHtmlBlockSpec.schema.model.flavour as 'affine:embed-html',
        {
          html,
          design: 'ai:makeItReal', // as tag
          xywh: bounds.serialize(),
        },
        surface.id
      );
    });
  },
  createSlides: (host, ctx) => {
    const data = ctx.get();
    const contents = data.contents as unknown[];
    if (!contents) return;
    const images = data.images as { url: string; id: string }[][];
    const service = host.spec.getService<EdgelessRootService>('affine:page');

    (async function () {
      for (let i = 0; i < contents.length - 1; i++) {
        const image = images[i];
        const content = contents[i];
        const job = service.createTemplateJob('template');
        await Promise.all(
          image.map(({ id, url }) =>
            fetch(url)
              .then(res => res.blob())
              .then(blob => job.job.assets.set(id, blob))
          )
        );
        await job.insertTemplate(content);
        getSurfaceElementFromEditor(host).refresh();
      }
    })().catch(console.error);
  },
  createImage: imageHandler,
  processImage: imageHandler,
  filterImage: imageHandler,
};

const getButtonText: {
  [key in keyof Partial<BlockSuitePresets.AIActions>]: (
    variants?: Omit<
      Parameters<BlockSuitePresets.AIActions[key]>[0],
      keyof BlockSuitePresets.AITextActionOptions
    >
  ) => string | undefined;
} = {
  brainstormMindmap: variants => {
    return variants?.regenerate ? 'Replace' : undefined;
  },
};

export function getInsertAndReplaceHandler<
  T extends keyof BlockSuitePresets.AIActions,
>(
  id: T,
  host: EditorHost,
  ctx: CtxRecord,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >
) {
  const handler = responses[id] ?? defaultHandler;
  const buttonText = getButtonText[id]?.(variants) ?? undefined;

  return createInsertResp(id, handler, host, ctx, buttonText);
}

export function actionToResponse<T extends keyof BlockSuitePresets.AIActions>(
  id: T,
  host: EditorHost,
  ctx: CtxRecord,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >
): FinishConfig {
  return {
    responses: [
      {
        name: 'Response',
        items: [
          {
            name: 'Continue in chat',
            icon: ChatWithAIIcon,
            handler: () => {
              reportResponse('result:continue-in-chat');
              const panel = getAIPanel(host);
              AIProvider.slots.requestOpenWithChat.emit();
              AIProvider.slots.requestContinueInChat.emit({
                host: host,
                show: true,
              });
              panel.hide();
            },
          },
          getInsertAndReplaceHandler(id, host, ctx, variants),
          asCaption(id, host),
          retry(getAIPanel(host)),
          discard(getAIPanel(host), getEdgelessCopilotWidget(host)),
        ],
      },
    ],
    actions: [],
  };
}

export function actionToGenerating<T extends keyof BlockSuitePresets.AIActions>(
  id: T,
  generatingIcon: TemplateResult<1>
) {
  return {
    generatingIcon,
    stages: generatingStages[id],
  };
}

export function actionToErrorResponse<
  T extends keyof BlockSuitePresets.AIActions,
>(
  panel: AffineAIPanelWidget,
  id: T,
  host: EditorHost,
  ctx: CtxRecord,
  variants?: Omit<
    Parameters<BlockSuitePresets.AIActions[T]>[0],
    keyof BlockSuitePresets.AITextActionOptions
  >
): ErrorConfig {
  return {
    upgrade: () => {
      AIProvider.slots.requestUpgradePlan.emit({ host: panel.host });
      panel.hide();
    },
    login: () => {
      AIProvider.slots.requestLogin.emit({ host: panel.host });
      panel.hide();
    },
    cancel: () => {
      panel.hide();
    },
    responses: [
      {
        name: 'Response',
        items: [getInsertAndReplaceHandler(id, host, ctx, variants)],
      },
      {
        name: '',
        items: [
          retry(getAIPanel(host)),
          discard(getAIPanel(host), getEdgelessCopilotWidget(host)),
        ],
      },
    ],
  };
}
