import React from 'react';
import { Card, Tag, Typography, Space, Button, Switch, Tooltip, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { DynamicSource } from '../../context/HeaderContext';

const { Text, Paragraph } = Typography;

interface HeaderEntryData {
  headerName: string;
  headerValue: string;
  domains?: string[];
  isDynamic?: boolean;
  sourceId?: string;
  prefix?: string;
  suffix?: string;
  isResponse?: boolean;
  isEnabled?: boolean;
}

interface HeaderEntryProps {
  entry: HeaderEntryData;
  isEditing: boolean;
  dynamicSources: DynamicSource[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
}

const HeaderEntry: React.FC<HeaderEntryProps> = ({
  entry,
  isEditing,
  dynamicSources,
  onEdit,
  onDelete,
  onToggleEnabled
}) => {
  const source = entry.isDynamic && entry.sourceId ?
    dynamicSources.find(s =>
      (s.sourceId?.toString() === entry.sourceId?.toString()) ||
      (s.locationId?.toString() === entry.sourceId?.toString())
    ) : null;

  const dynamicValue = source ?
    (source.sourceContent || source.locationContent || '') :
    'Source not found';

  const headerValue = entry.isDynamic ?
    `${entry.prefix || ''}${dynamicValue}${entry.suffix || ''}` :
    entry.headerValue;

  return (
    <Card
      className={`header-entry ${isEditing ? 'editing' : ''}`}
      size="small"
      // "filled" is valid in antd 5.13+ but @types/antd lags behind
      variant={"filled" as unknown as "borderless" | "outlined"}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Space align="center">
            <Text strong>{entry.headerName}</Text>
            {entry.isResponse && <Tag color="blue">Response</Tag>}
            {!entry.isResponse && <Tag color="green">Request</Tag>}
            {entry.isDynamic && <Tag color="purple">Dynamic</Tag>}
          </Space>

          <Paragraph
            ellipsis={{ rows: 2, expandable: true, symbol: 'more' }}
            style={{ marginTop: 4, marginBottom: 8 }}
          >
            {headerValue}
          </Paragraph>

          <div className="domain-tags" style={{ marginTop: 4 }}>
            {entry.domains?.map(domain => (
              <Tag key={domain} style={{ marginBottom: 0 }}>
                {domain}
              </Tag>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch
            checked={entry.isEnabled !== false}
            onChange={onToggleEnabled}
            disabled={isEditing}
            size="small"
          />

          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              onClick={onEdit}
            />
          </Tooltip>

          <Popconfirm
            title="Delete this header?"
            description="This action cannot be undone."
            onConfirm={onDelete}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
            />
          </Popconfirm>
        </div>
      </div>

      {entry.isDynamic && source && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          <Text type="secondary">
            Source: {source.sourceTag || source.locationTag || source.sourcePath || source.locationPath}
          </Text>
        </div>
      )}
    </Card>
  );
};

export default HeaderEntry;
