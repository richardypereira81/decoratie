import React from 'react';

export default function TabelaProdutos({ produtos, onAtualizar }) {
  const formatar = (valor) => {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatarNumero = (valor, casas = 2) => {
    return valor.toLocaleString('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
  };

  return (
    <div>
      <h2 style={{ marginBottom: '15px', color: '#2c3e50' }}>Produtos Importados</h2>
      <div className="tabela-container">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>NCM</th>
              <th>CFOP</th>
              <th>Un.</th>
              <th>Qtd</th>
              <th>V. Unit. XML</th>
              <th>V. Total Item</th>
              <th>IPI Total</th>
              <th>Frete Rat.</th>
              <th>C. Base Unit.</th>
              <th>IPI Unit.</th>
              <th>Frete Unit.</th>
              <th>C. Real Unit.</th>
              <th>Margem %</th>
              <th>V. Venda</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((produto, idx) => (
              <tr key={idx}>
                <td className="numero">{produto.cProd}</td>
                <td>{produto.xProd}</td>
                <td className="numero">{produto.ncm}</td>
                <td className="numero">{produto.cfop}</td>
                <td className="numero">{produto.unidade}</td>
                <td className="numero">{formatarNumero(produto.quantidade)}</td>
                <td className="numero">{formatar(produto.valorUnitarioXml)}</td>
                <td className="numero">{formatar(produto.valorTotalItem)}</td>
                <td className="numero">{formatar(produto.ipiTotal)}</td>
                <td className="numero">{formatar(produto.freteRateado)}</td>
                <td className="numero">{formatar(produto.custoBaseUnitario)}</td>
                <td className="numero">{formatar(produto.ipiUnitario)}</td>
                <td className="numero">{formatar(produto.freteUnitario)}</td>
                <td className={`numero ${produto.editadoManualmente ? 'edited' : ''}`}>
                  <input
                    type="number"
                    step="0.01"
                    value={produto.custoRealUnitario}
                    onChange={(e) =>
                      onAtualizar(idx, 'custoRealUnitario', e.target.value)
                    }
                    className="input-celula"
                  />
                </td>
                <td className={`numero ${produto.editadoManualmente ? 'edited' : ''}`}>
                  <input
                    type="number"
                    step="0.01"
                    value={produto.margem}
                    onChange={(e) => onAtualizar(idx, 'margem', e.target.value)}
                    className="input-celula"
                  />
                </td>
                <td className={`numero ${produto.editadoManualmente ? 'edited' : ''}`}>
                  <input
                    type="number"
                    step="0.01"
                    value={produto.valorVenda}
                    onChange={(e) => onAtualizar(idx, 'valorVenda', e.target.value)}
                    className="input-celula"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: '10px', color: '#7f8c8d', fontSize: '0.9em' }}>
        💡 Campos em destaque podem ser editados. Altere margem, custo real ou valor de venda conforme necessário.
      </p>
    </div>
  );
}
