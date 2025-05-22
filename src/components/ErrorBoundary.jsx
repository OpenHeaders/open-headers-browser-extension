import React from 'react';
import { Result, Button } from 'antd';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px' }}>
          <Result
            status="error"
            title="Something went wrong"
            subTitle="There was an error loading the popup. Please try closing and reopening it."
            extra={
              <Button 
                type="primary" 
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;