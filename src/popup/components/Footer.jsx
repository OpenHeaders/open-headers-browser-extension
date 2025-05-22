import React from 'react';
import { Button, Space, Tooltip, Upload, App, Typography } from 'antd';
import { 
  ExportOutlined, 
  ImportOutlined, 
  QuestionCircleOutlined,
  GithubOutlined
} from '@ant-design/icons';
import { storage, runtime } from '../../utils/browser-api';

const { Text, Link } = Typography;

/**
 * Professional footer component with labeled actions and version info
 */
const Footer = () => {
  const { message } = App.useApp();
  
  // Version information
  const version = '2.0.0';
  
  // Handle export configuration
  const handleExport = async () => {
    try {
      // Get data from storage
      const getDataPromise = new Promise((resolve) => {
        storage.sync.get(['savedData'], (syncData) => {
          storage.local.get(['dynamicSources'], (localData) => {
            resolve({
              savedData: syncData.savedData || {},
              dynamicSources: localData.dynamicSources || []
            });
          });
        });
      });
      
      const data = await getDataPromise;
      
      // Format timestamp for filename
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = `open-headers-config-${timestamp}.json`;
      
      // Create a blob and download link
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create and click a download link
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      message.success('Configuration exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      message.error('Failed to export configuration');
    }
  };
  
  // Handle import configuration
  const handleImport = (file) => {
    try {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const config = JSON.parse(event.target.result);
          
          if (!config.savedData) {
            message.error('Invalid configuration file: savedData missing');
            return;
          }
          
          // Save data to storage
          storage.sync.set({ savedData: config.savedData }, () => {
            // If dynamic sources are present, save them too
            if (config.dynamicSources && Array.isArray(config.dynamicSources)) {
              storage.local.set({ dynamicSources: config.dynamicSources }, () => {
                // Notify the background script about the import
                runtime.sendMessage({
                  type: 'configurationImported',
                  savedData: config.savedData,
                  dynamicSources: config.dynamicSources
                });
                
                message.success('Configuration imported successfully');
              });
            } else {
              // Notify without dynamic sources
              runtime.sendMessage({
                type: 'configurationImported',
                savedData: config.savedData
              });
              
              message.success('Configuration imported successfully');
            }
          });
        } catch (parseError) {
          console.error('Parse error:', parseError);
          message.error('Failed to parse configuration file');
        }
      };
      
      reader.readAsText(file);
    } catch (error) {
      console.error('Import error:', error);
      message.error('Failed to import configuration');
    }
    
    // Prevent default upload behavior
    return false;
  };
  
  // Handle opening the welcome page
  const handleOpenWelcomePage = () => {
    runtime.sendMessage({ type: 'forceOpenWelcomePage' }, () => {
      // Close the popup after sending the message
      window.close();
    });
  };

  // Handle opening GitHub page
  const handleOpenGitHub = () => {
    runtime.sendMessage({ 
      type: 'openTab', 
      url: 'https://github.com/OpenHeaders/open-headers-browser-extension' 
    }, () => {
      window.close();
    });
  };
  
  return (
    <div className="footer">
      <div>
        <Space size={12}>
          <Button 
            type="text" 
            icon={<ExportOutlined />} 
            onClick={handleExport}
            size="small"
          >
            Export
          </Button>
          
          <Upload
            beforeUpload={handleImport}
            showUploadList={false}
            accept=".json"
          >
            <Button 
              type="text" 
              icon={<ImportOutlined />}
              size="small"
            >
              Import
            </Button>
          </Upload>
          
          <Button 
            type="text" 
            icon={<QuestionCircleOutlined />} 
            onClick={handleOpenWelcomePage}
            size="small"
          >
            Guide
          </Button>
        </Space>
      </div>
      
      <div>
        <Space size={8} align="center">
          <Text style={{ fontSize: '11px', color: '#8c8c8c' }}>v{version}</Text>
          <Button 
            type="text" 
            icon={<GithubOutlined />} 
            onClick={handleOpenGitHub}
            size="small"
            style={{ padding: '0 4px', height: '20px', minWidth: 'auto' }}
          />
        </Space>
      </div>
    </div>
  );
};

export default Footer;