import React from 'react';

export default function DetalhesImportacao({
  importacao,
  onVoltar,
  onExportarCSV,
  onExportarXLSX,
}) {
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

  const formatarNumero = (valor, casas = 2) => {
    return valor.toLocaleString('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
  };

  if (!importacao) {
    return <div>Carregando...</div>;
  }

  const { itens, ...cabecalho } = importacao;

  return (
    <div className="modal-overlay" style={{ position: 'static' }}>
      <div className="modal-content" style={{ maxWidth: '100%', maxHeight: 'none' }}>
        <div className="modal-header">
          <h2>Detalhes da Importação</h2>
          <button className="modal-close" onClick={onVoltar}>
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
            {cabecalho.numeroNota && (
              <div>
                <strong>NF-e:</strong> {cabecalho.numeroNota}
              </div>
            )}
            {cabecalho.chaveNota && (
              <div>
                <strong>Chave:</strong> {cabecalho.chaveNota}
              </div>
            )}
            {cabecalho.emitente && (
              <div>
                <strong>Emitente:</strong> {cabecalho.emitente}
              </div>
            )}
            {cabecalho.dataEmissao && (
              <div>
                <strong>Emissão:</strong> {cabecalho.dataEmissao}
              </div>
            )}
            <div>
              <strong>Importado em:</strong> {formatarData(cabecalho.dataImportacao)}
            </div>
            <div>
              <strong>Margem Global:</strong> {cabecalho.margemGlobal?.toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="resumo">
          <div className="resumo-card">
            <div className="resumo-label">Itens</div>
            <div className="resumo-valor">{cabecalho.totalItens}</div>
          </div>
          <div className="resumo-card">
            <div className="resumo-label">Valor Total</div>
            <div className="resumo-valor">{formatar(cabecalho.valorTotal)}</div>
          </div>
          <div className="resumo-card">
            <div className="resumo-label">IPI Total</div>
            <div className="resumo-valor">{formatar(cabecalho.ipiTotal)}</div>
          </div>
          <div className="resumo-card">
            <div className="resumo-label">Frete Total</div>
            <div className="resumo-valor">{formatar(cabecalho.freteTotal)}</div>
          </div>
          <div className="resumo-card">
            <div className="resumo-label">Custo Total</div>
            <div className="resumo-valor">{formatar(cabecalho.custoTotal)}</div>
          </div>
          <div className="resumo-card">
            <div className="resumo-label">Venda Total</div>
            <div className="resumo-valor" style={{ color: '#27ae60' }}>
              {formatar(cabecalho.vendaTotal)}
            </div>
          </div>
        </div>

        <h3 style={{ marginTop: '20px', marginBottom: '15px' }}>Produtos</h3>
        <div className="tabela-container">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>NCM</th>
                <th>Qtd</th>
                <th>V. Unitário XML</th>
                <th>V. Total Item</th>
                <th>C. Real Unit.</th>
                <th>Margem %</th>
                <th>V. Venda</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, idx) => (
                <tr key={idx}>
                  <td className="numero">{item.cProd}</td>
                  <td>{item.xProd}</td>
                  <td className="numero">{item.ncm}</td>
                  <td className="numero">{formatarNumero(item.quantidade)}</td>
                  <td className="numero">{formatar(item.valorUnitarioXml)}</td>
                  <td className="numero">{formatar(item.valorTotalItem)}</td>
                  <td className="numero">{formatar(item.custoRealUnitario)}</td>
                  <td className="numero">{formatarNumero(item.margem, 2)}%</td>
                  <td className="numero">{formatar(item.valorVenda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="button-group" style={{ marginTop: '20px' }}>
          <button className="btn-export" onClick={onExportarCSV}>
            📥 Exportar CSV
          </button>
          <button className="btn-export" onClick={onExportarXLSX}>
            📊 Exportar XLSX
          </button>
          <button className="btn-secondary" onClick={onVoltar}>
            ← Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
