import React from 'react';
import { Empty } from 'antd';
import { ApartmentOutlined } from '@ant-design/icons';

const DiagramPage: React.FC = () => {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Empty
        image={<ApartmentOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
        description="关系图将在 Phase 5 实现"
      />
    </div>
  );
};

export default DiagramPage;
