import type { FC } from 'react';

import { modalHeaderWrapper } from './share.css';
export const ModalHeader: FC<{
  title: string;
  subTitle: string;
}> = ({ title, subTitle }) => {
  return (
    <div className={modalHeaderWrapper}>
      <p>
        <img
          src="/WechatIMG2187.png"
          width={22}
          style={{ marginRight: 5 }}
          alt=""
        />
        {title}
      </p>
      <p>{subTitle}</p>
    </div>
  );
};
