import type {
  AffineAIPanelWidget,
  AffineSlashMenuActionItem,
  AffineSlashMenuContext,
  AffineSlashMenuItem,
  AffineSlashSubMenu,
  AIItemConfig,
} from '@blocksuite/blocks';
import {
  AFFINE_AI_PANEL_WIDGET,
  AffineSlashMenuWidget,
  AIStarIcon,
  MoreHorizontalIcon,
} from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import { html } from 'lit';

import { AIItemGroups } from '../../_common/config';
import { handleInlineAskAIAction } from '../../actions/doc-handler';
import { AIProvider } from '../../provider';

export function setupSlashMenuEntry(slashMenu: AffineSlashMenuWidget) {
  const AIItems = AIItemGroups.map(group => group.items).flat();

  const iconWrapper = (icon: AIItemConfig['icon']) => {
    return html`<div style="color: var(--affine-primary-color)">
      ${typeof icon === 'function' ? html`${icon()}` : icon}
    </div>`;
  };

  const showWhenWrapper =
    (item?: AIItemConfig) =>
    ({ rootElement }: AffineSlashMenuContext) => {
      const affineAIPanelWidget = rootElement.host.view.getWidget(
        AFFINE_AI_PANEL_WIDGET,
        rootElement.model.id
      );
      if (affineAIPanelWidget === null) return false;

      const chain = rootElement.host.command.chain();
      const editorMode = rootElement.service.docModeService.getMode(
        rootElement.doc.id
      );

      return item?.showWhen?.(chain, editorMode, rootElement.host) ?? true;
    };

  const actionItemWrapper = (
    item: AIItemConfig
  ): AffineSlashMenuActionItem => ({
    ...basicItemConfig(item),
    action: ({ rootElement }: AffineSlashMenuContext) => {
      item?.handler?.(rootElement.host);
    },
  });

  const subMenuWrapper = (item: AIItemConfig): AffineSlashSubMenu => {
    assertExists(item.subItem);
    return {
      ...basicItemConfig(item),
      subMenu: item.subItem.map<AffineSlashMenuActionItem>(
        ({ type, handler }) => ({
          name: type,
          action: ({ rootElement }) => handler?.(rootElement.host),
        })
      ),
    };
  };

  const basicItemConfig = (item: AIItemConfig) => {
    return {
      name: item.name,
      icon: iconWrapper(item.icon),
      alias: ['ai'],
      showWhen: showWhenWrapper(item),
    };
  };

  const menu = slashMenu.config.items.slice();
  menu.unshift({
    name: 'Ask Zebra',
    icon: AIStarIcon,
    showWhen: showWhenWrapper(),
    action: ({ rootElement }) => {
      const view = rootElement.host.view;
      const affineAIPanelWidget = view.getWidget(
        AFFINE_AI_PANEL_WIDGET,
        rootElement.model.id
      ) as AffineAIPanelWidget;
      assertExists(affineAIPanelWidget);
      assertExists(AIProvider.actions.chat);
      assertExists(affineAIPanelWidget.host);
      handleInlineAskAIAction(affineAIPanelWidget.host);
    },
  });

  const AIMenuItems: AffineSlashMenuItem[] = [
    { groupName: 'Zebra AI' },
    ...AIItems.filter(({ name }) =>
      ['Fix spelling', 'Fix grammar'].includes(name)
    ).map(item => ({
      ...actionItemWrapper(item),
      name: `${item.name} from above`,
    })),

    ...AIItems.filter(({ name }) =>
      ['Summarize', 'Continue writing'].includes(name)
    ).map(actionItemWrapper),

    {
      name: 'Action with above',
      icon: iconWrapper(MoreHorizontalIcon),
      subMenu: [
        { groupName: 'Action with above' },
        ...AIItems.filter(({ name }) =>
          ['Translate to', 'Change tone to'].includes(name)
        ).map(subMenuWrapper),

        ...AIItems.filter(({ name }) =>
          [
            'Improve writing',
            'Make it longer',
            'Make it shorter',
            'Generate outline',
            'Find actions',
          ].includes(name)
        ).map(actionItemWrapper),
      ],
    },
  ];

  const basicGroupEnd = menu.findIndex(
    item => 'groupName' in item && item.groupName === 'List'
  );
  // insert ai item after basic group
  menu.splice(basicGroupEnd, 0, ...AIMenuItems);

  slashMenu.config = {
    ...AffineSlashMenuWidget.DEFAULT_CONFIG,
    items: menu,
  };
}
