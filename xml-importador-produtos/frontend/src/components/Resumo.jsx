import React from 'react';

export default function Resumo({ resumo }) {
  if (!resumo) return null;

  const formatar = (valor) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  return (
    <div className="resumo">
      <div className="resumo-card">
        <div className="resumo-label">Itens</div>
        <div className="resumo-valor">{resumo.totalItens}</div>
      </div>

      <div className="resumo-card">
        <div className="resumo-label">Quantidade Total</div>
        <div className="resumo-valor">{resumo.quantidade.toFixed(2)}</div>
      </div>

      <div className="resumo-card">
        <div className="resumo-label">Valor XML</div>
        <div className="resumo-valor">{formatar(resumo.valorTotal)}</div>
      </div>

      <div className="resumo-card">
        <div className="resumo-label">IPI Total</div>
        <div className="resumo-valor">{formatar(resumo.ipiTotal)}</div>
      </div>

      <div className="resumo-card">
        <div className="resumo-label">Frete Total</div>
        <div className="resumo-valor">{formatar(resumo.freteTotal)}</div>
      </div>

      <div className="resumo-card">
        <div className="resumo-label">Custo Total Real</div>
        <div className="resumo-valor">{formatar(resumo.custoTotal)}</div>
      </div>

      <div className="resumo-card">
        <div className="resumo-label">Venda Total</div>
        <div className="resumo-valor" style={{ color: '#27ae60' }}>
          {formatar(resumo.vendaTotal)}
        </div>
      </div>

      <div className="resumo-card">
        <div className="resumo-label">Lucro Estimado</div>
        <div className="resumo-valor" style={{ color: '#3498db' }}>
          {formatar(resumo.vendaTotal - resumo.custoTotal)}
        </div>
      </div>
    </div>
  );
}
