import React, { useState } from 'react';
import DetalhesImportacao from './DetalhesImportacao';

export default function Historico({ importacoes, onExportarCSV, onExportarXLSX, onAtualizar }) {
  const [selecionada, setSelecionada] = useState(null);
  const [detalhes, setDetalhes] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const handleVerDetalhes = async (importacao) => {
    try {
      setCarregando(true);
      const res = await fetch(
        `http://localhost:3001/api/importacoes/detalhes/${importacao.id}`
      );
      if (res.ok) {
        const data = await res.json();
        setDetalhes(data.importacao);
        setSelecionada(importacao.id);
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error);
    } finally {
      setCarregando(false);
    }
  };

  const formatarData = (dataISO) => {
    if (!dataISO) return 'N/A';
    const data = new Date(dataISO);
    return data.toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatar = (valor) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  if (detalhes && selecionada) {
    return (
      <DetalhesImportacao
        importacao={detalhes}
        onVoltar={() => {
          setDetalhes(null);
          setSelecionada(null);
        }}
        onExportarCSV={() => onExportarCSV(selecionada)}
        onExportarXLSX={() => onExportarXLSX(selecionada)}
      />
    );
  }

  return (
    <div className="historico">
      <h2>📋 Histórico de Importações</h2>
      {importacoes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">Nenhuma importação salva ainda</div>
        </div>
      ) : (
        <div className="historico-lista">
          {importacoes.map((imp) => (
            <div
              key={imp.id}
              className="historico-item"
              onClick={() => handleVerDetalhes(imp)}
              style={{ cursor: carregando ? 'wait' : 'pointer' }}
            >
              <div className="historico-item-titulo">
                NF-e {imp.numeroNota || 'N/A'}
              </div>
              <div className="historico-item-info">
                📅 {formatarData(imp.dataImportacao)}
              </div>
              <div className="historico-item-info">
                🏢 {imp.emitente || 'Sem emitente'}
              </div>
              <div className="historico-item-info">
                📦 {imp.totalItens} item(ns) • {formatar(imp.vendaTotal)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
