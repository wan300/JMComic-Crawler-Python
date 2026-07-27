import { render } from 'preact';
import { App } from './app';
import { installMockBridge } from './lib/mock-bridge';
import './styles.css';

if (new URLSearchParams(location.search).get('mock') === '1' || window.__JMCR_MOCK__) {
  installMockBridge();
}

render(<App />, document.getElementById('app')!);
