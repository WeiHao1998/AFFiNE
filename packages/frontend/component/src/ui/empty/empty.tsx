import type { CSSProperties, ReactNode } from 'react';

import * as styles from './index.css';

type ContainerStyleProps = {
  width?: string;
  height?: string;
  fontSize?: string;
};
export type EmptyContentProps = {
  containerStyle?: ContainerStyleProps;
  title?: ReactNode;
  description?: ReactNode;
  descriptionStyle?: CSSProperties;
};

export const Empty = ({
  title,
  description,
  descriptionStyle,
}: EmptyContentProps) => {
  return (
    <div className={styles.emptyContainer}>
      <div style={{ color: 'var(--affine-black)' }}>
        <img src="/empty_icon.png" alt="" width={250} height={250} />
      </div>
      {title && (
        <p
          style={{
            marginTop: '30px',
            color: 'var(--affine-text-primary-color)',
            fontWeight: 700,
          }}
        >
          {title}
        </p>
      )}
      {description && (
        <p style={{ marginTop: title ? '8px' : '30px', ...descriptionStyle }}>
          {description}
        </p>
      )}
    </div>
  );
};

export default Empty;
