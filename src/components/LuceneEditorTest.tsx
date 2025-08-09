import React, { useState } from 'react';
import { LuceneQueryEditor } from './LuceneQueryEditor';

/**
 * Simple test component for LuceneQueryEditor keymap functionality
 * Add this to your Storybook or use in development
 */
export function LuceneEditorTest() {
  const [query, setQuery] = useState('status:error AND level:warn');
  const [lastSubmitted, setLastSubmitted] = useState('');
  const [events, setEvents] = useState<string[]>([]);

  const addEvent = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setEvents(prev => [`${timestamp}: ${message}`, ...prev.slice(0, 9)]);
  };

  const mockAutocompleter = async (word: string) => {
    addEvent(`🔍 Autocomplete requested for: "${word}"`);
    
    const fields = ['status', 'level', 'message', 'timestamp', 'host', 'service', 'error', 'user_id'];
    const filtered = fields.filter(field => 
      field.toLowerCase().includes(word.toLowerCase())
    );
    
    return {
      from: 0,
      options: filtered.map(field => ({
        label: field,
        type: 'variable',
        detail: `Field: ${field}`,
      }))
    };
  };

  const handleSubmit = (submittedQuery: string) => {
    setLastSubmitted(submittedQuery);
    addEvent(`✅ Query submitted: "${submittedQuery}"`);
  };

  const handleChange = (newQuery: string) => {
    setQuery(newQuery);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', fontFamily: 'Arial, sans-serif' }}>
      <h2>🎹 Lucene Editor Keymap Test</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Editor */}
        <div>
          <h3>Editor</h3>
          <div style={{ 
            border: '2px solid #ddd', 
            borderRadius: '8px', 
            height: '200px',
            backgroundColor: '#1e1e1e'
          }}>
            <LuceneQueryEditor
              value={query}
              onChange={handleChange}
              onSubmit={handleSubmit}
              autocompleter={mockAutocompleter}
              placeholder="Type your query and test keyboard shortcuts..."
            />
          </div>
          
          <div style={{ 
            marginTop: '15px', 
            padding: '15px', 
            background: '#f0f8ff', 
            borderRadius: '8px',
            border: '1px solid #b3d9ff'
          }}>
            <h4 style={{ margin: '0 0 10px 0' }}>🎯 Instructions:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li><strong>Shift + Enter</strong> → Submit query (should trigger onSubmit)</li>
              <li><strong>Ctrl + Enter</strong> → Show autocomplete popup</li>
              <li><strong>Type field names</strong> → Get suggestions (status, level, etc.)</li>
            </ul>
          </div>
        </div>

        {/* Status Panel */}
        <div>
          <h3>📊 Status</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <strong>Last Submitted:</strong>
            <div style={{ 
              padding: '10px', 
              background: lastSubmitted ? '#e8f5e8' : '#f5f5f5', 
              border: '1px solid #ddd',
              borderRadius: '4px',
              marginTop: '5px',
              fontFamily: 'monospace',
              wordBreak: 'break-all'
            }}>
              {lastSubmitted || 'None yet'}
            </div>
          </div>

          <div>
            <strong>Recent Events:</strong>
            <div style={{ 
              height: '200px', 
              overflow: 'auto', 
              border: '1px solid #ddd',
              borderRadius: '4px',
              padding: '10px',
              backgroundColor: '#fafafa',
              fontFamily: 'monospace',
              fontSize: '12px',
              marginTop: '5px'
            }}>
              {events.length === 0 ? (
                <div style={{ color: '#888' }}>Events will appear here...</div>
              ) : (
                events.map((event, index) => (
                  <div key={index} style={{ 
                    padding: '2px 0',
                    borderBottom: index < events.length - 1 ? '1px solid #eee' : 'none'
                  }}>
                    {event}
                  </div>
                ))
              )}
            </div>
          </div>

          <button 
            onClick={() => setEvents([])} 
            style={{ 
              marginTop: '10px', 
              padding: '8px 12px', 
              backgroundColor: '#007bff', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            Clear Events
          </button>
        </div>
      </div>

      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#fff3cd', 
        border: '1px solid #ffeaa7',
        borderRadius: '8px'
      }}>
        <h4 style={{ margin: '0 0 10px 0' }}>🔧 Debugging Tips:</h4>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>Open browser console to see additional debug messages</li>
          <li>Make sure to click in the editor to focus it before testing shortcuts</li>
          <li>If Shift+Enter doesn&apos;t work, check the console for errors</li>
          <li>Ctrl+Enter should show a dropdown with field suggestions</li>
        </ul>
      </div>
    </div>
  );
}
