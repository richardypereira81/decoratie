import React, { useState, useRef } from 'react';

export default function UploadArea({ onUpload, margemGlobal }) {
  const [dragOver, setDragOver] = useState(false);
  const [freteManual, setFreteManual] = useState('');
  const [mostrarFrete, setMostrarFrete] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);

    const arquivos = e.dataTransfer.files;
    if (arquivos.length > 0) {
      const arquivo = arquivos[0];
      if (arquivo.name.endsWith('.xml')) {
        onUpload(arquivo, freteManual);
      } else {
        alert('Por favor, selecione um arquivo XML válido');
      }
    }
  };

  const handleClickArea = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e) => {
    const arquivo = e.target.files?.[0];
    if (arquivo) {
      if (arquivo.name.endsWith('.xml')) {
        onUpload(arquivo, freteManual);
      } else {
        alert('Por favor, selecione um arquivo XML válido');
      }
    }
  };

  return (
    <div>
      <div
        className={`upload-area ${dragOver ? 'dragover' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClickArea}
      >
        <div className="upload-icon">📤</div>
        <div className="upload-text">Arraste seu XML aqui ou clique para selecionar</div>
        <div className="upload-hint">Aceita arquivos .xml de NF-e</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml"
          onChange={handleFileSelect}
        />
      </div>

      <div className="form-group single" style={{ marginTop: '15px' }}>
        <label>
          <input
            type="checkbox"
            checked={mostrarFrete}
            onChange={(e) => setMostrarFrete(e.target.checked)}
            style={{ marginRight: '8px' }}
          />
          Informar frete manualmente (Se o XML não contiver)
        </label>
      </div>

      {mostrarFrete && (
        <div className="form-group single">
          <label htmlFor="frete">Valor do Frete (R$)</label>
          <input
            id="frete"
            type="number"
            step="0.01"
            value={freteManual}
            onChange={(e) => setFreteManual(e.target.value)}
            placeholder="0.00"
          />
        </div>
      )}
    </div>
  );
}
