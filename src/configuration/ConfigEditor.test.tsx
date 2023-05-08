import React from 'react';
import { mount, shallow } from 'enzyme';
import { ConfigEditor } from './ConfigEditor';
import { DataSourceHttpSettings } from '@grafana/ui';
import { createDefaultConfigOptions } from './mocks';
import { render } from '@testing-library/react';

describe('ConfigEditor', () => {
  it('should render without error', () => {
    mount(<ConfigEditor onOptionsChange={() => {}} options={createDefaultConfigOptions()} />);
  });

  it('should render all parts of the config', () => {
    const wrapper = shallow(<ConfigEditor onOptionsChange={() => {}} options={createDefaultConfigOptions()} />);
    expect(wrapper.find(DataSourceHttpSettings).length).toBe(1);
  });

  it('should set defaults', () => {
    const options = createDefaultConfigOptions();

    // delete options.jsonData.timestampField;

    render(
      <ConfigEditor
        onOptionsChange={(options) => {
          expect(options.jsonData.timeField).toBe('timestamp');
        }}
        options={options}
      />
    );
    expect.assertions(5);
  });

  it('should not apply default if values are set', () => {
    const onChange = jest.fn();

    mount(<ConfigEditor onOptionsChange={onChange} options={createDefaultConfigOptions()} />);

    expect(onChange).toHaveBeenCalledTimes(0);
  });
});
