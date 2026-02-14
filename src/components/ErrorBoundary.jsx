import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0d0d0d',
          color: '#f5f0e6',
          fontFamily: 'serif',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <h1 style={{ color: '#c9a227', fontSize: '2rem', marginBottom: '1rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#d4cfc5', marginBottom: '1.5rem', maxWidth: '400px' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 2rem',
              background: 'transparent',
              border: '2px solid #c9a227',
              color: '#c9a227',
              fontFamily: 'serif',
              fontSize: '1rem',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
