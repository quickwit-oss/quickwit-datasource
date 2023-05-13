import { render, screen } from '@testing-library/react';
import React from 'react';

import { ConfigEditor } from './ConfigEditor';
import { createDefaultConfigOptions } from './mocks';

describe('ConfigEditor', () => {
  it('should render without error', () => {
    expect(() =>
      render(<ConfigEditor onOptionsChange={() => {}} options={createDefaultConfigOptions()} />)
    ).not.toThrow();
  });

  it('should render all parts of the config', () => {
    render(<ConfigEditor onOptionsChange={() => {}} options={createDefaultConfigOptions()} />);

    // Check DataSourceHttpSettings are rendered
    expect(screen.getByRole('heading', { name: 'HTTP' })).toBeInTheDocument();

    // Check ElasticDetails are rendered
    expect(screen.getByText('Index settings')).toBeInTheDocument();
  });

  it('should not apply default if values are set', () => {
    const mockOnOptionsChange = jest.fn();

    render(<ConfigEditor onOptionsChange={mockOnOptionsChange} options={createDefaultConfigOptions()} />);

    expect(mockOnOptionsChange).toHaveBeenCalledTimes(0);
  });
});
