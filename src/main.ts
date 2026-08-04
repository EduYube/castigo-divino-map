import { renderApp } from './app/renderApp';
import './styles/main.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('No se encontró el elemento raíz de la aplicación.');
}

app.innerHTML = renderApp();
