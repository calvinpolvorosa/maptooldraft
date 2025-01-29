import React from 'react';
import MapSelector from './components/MapSelector';
import './App.css';

function App() {
  return (
    <div className="App">
      <header>
        <h1>Service Territory Creator</h1>
        <p>Use the draw tool to outline your service territory with a polygon shape.</p>
        <p className="subtext">Then add extended ranges to cover the cost for travelling to farther projects, if desired.</p>
      </header>
      <MapSelector />
    </div>
  );
}

export default App; 