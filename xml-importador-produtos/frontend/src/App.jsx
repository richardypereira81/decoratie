import React, { useState, useEffect } from 'react';
import UploadArea from './components/UploadArea';
import TabelaProdutos from './components/TabelaProdutos';
import Resumo from './components/Resumo';
import Historico from './components/Historico';

export default function App() {
  const [estado, setEstado] = useState('initial'); // initial, processando, pronto
  const [cabecalho, setCabecalho] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [margemGlobal, setMargemGlobal] = useState(10);
  const [freteTotal, setFreteTotal] = useState(0);
  const [freteManual, setFreteManual] = useState('');
  const [mensagem, setMensagem] = useState(null);
  const [importacoes, setImportacoes] = useState([]);
  const [xmlContent, setXmlContent] = useState(null);
  const [historicoVisivel, setHistoricoVisivel] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || '/api';

  useEffect(() => {
    carregarImportacoes();
  }, []);

  const carregarImportacoes = async () => {
    try {
      const res = await fetch(`${API_URL}/importacoes/listar-importacoes`);
      if (res.ok) {
        const data = await res.json();
        setImportacoes(data.importacoes || []);
      }
    } catch (error) {
      console.error('Erro ao carregar importações:', error);
    }
  };

  const exibirMensagem = (texto, tipo) => {
    setMensagem({ texto, tipo });
    setTimeout(() => setMensagem(null), 5000);
  };

  const handleUpload = async (arquivo, freteM) => {
    try {
      if (!arquivo) {
        throw new Error('Selecione um arquivo XML para continuar.');
      }

      if (arquivo.size === 0) {
        throw new Error('O arquivo XML esta vazio. Gere ou baixe o XML novamente antes de importar.');
      }

      setEstado('processando');
      exibirMensagem('Processando XML...', 'info');

      const conteudoXML = await arquivo.text();

      if (!conteudoXML.trim()) {
        throw new Error('O arquivo XML esta vazio. Gere ou baixe o XML novamente antes de importar.');
      }

      setXmlContent(conteudoXML);

      const res = await fetch(`${API_URL}/importacoes/processar-xml`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          xmlContent: conteudoXML,
          fileName: arquivo.name,
          margemGlobal,
          freteManual: freteM || null,
        }),
      });

      if (!res.ok) {
        const erro = await res.json();
        throw new Error(erro.erro || 'Erro ao processar XML');
      }

      const data = await res.json();

      setCabecalho(data.cabecalho);
      setProdutos(data.produtos);
      setResumo(data.resumo);
      setFreteTotal(data.freteTotal);
      setEstado('pronto');
      exibirMensagem('XML processado com sucesso!', 'success');
    } catch (error) {
      console.error('Erro:', error);
      exibirMensagem(error.message, 'error');
      setEstado('initial');
    }
  };

  const handleAtualizarProduto = (index, campo, valor) => {
    const novosProdutos = [...produtos];
    novosProdutos[index] = {
      ...novosProdutos[index],
      [campo]: valor === '' ? 0 : parseFloat(valor) || 0,
      editadoManualmente: 1,
    };

    // Se alterar margem, recalcular valor de venda
    if (campo === 'margem') {
      const custoReal = novosProdutos[index].custoRealUnitario;
      novosProdutos[index].valorVenda =
        custoReal + (custoReal * novosProdutos[index][campo]) / 100;
    }

    // Se alterar custo real, recalcular valor de venda mantendo margem
    if (campo === 'custoRealUnitario') {
      const margem = novosProdutos[index].margem;
      novosProdutos[index].valorVenda =
        novosProdutos[index][campo] + (novosProdutos[index][campo] * margem) / 100;
    }

    setProdutos(novosProdutos);
    // Recalcular resumo
    recalcularResumo(novosProdutos);
  };

  const recalcularResumo = (prods) => {
    const novoResumo = {
      totalItens: prods.length,
      quantidade: prods.reduce((sum, p) => sum + p.quantidade, 0),
      valorTotal: prods.reduce((sum, p) => sum + p.valorTotalItem, 0),
      ipiTotal: prods.reduce((sum, p) => sum + p.ipiTotal, 0),
      freteTotal: freteTotal,
      custoTotal: prods.reduce((sum, p) => sum + p.custoRealUnitario * p.quantidade, 0),
      vendaTotal: prods.reduce((sum, p) => sum + p.valorVenda * p.quantidade, 0),
    };
    setResumo(novoResumo);
  };

  const handleSalvar = async () => {
    try {
      exibirMensagem('Salvando importação...', 'info');

      const res = await fetch(`${API_URL}/importacoes/salvar-importacao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xmlContent: xmlContent,
          cabecalho,
          produtos,
          resumo,
          margemGlobal,
          freteManual: freteManual || null,
        }),
      });

      if (!res.ok) {
        const erro = await res.json();
        throw new Error(erro.erro || 'Erro ao salvar');
      }

      const data = await res.json();
      if (data.sucesso) {
        exibirMensagem('Importação salva com sucesso!', 'success');
        setTimeout(() => {
          setEstado('initial');
          setProdutos([]);
          setCabecalho(null);
          setResumo(null);
          setFreteManual('');
          carregarImportacoes();
        }, 1000);
      }
    } catch (error) {
      console.error('Erro:', error);
      exibirMensagem(error.message, 'error');
    }
  };

  const handleExportarCSV = (importacaoId) => {
    window.location.href = `${API_URL}/importacoes/exportar-csv/${importacaoId}`;
  };

  const handleExportarXLSX = (importacaoId) => {
    window.location.href = `${API_URL}/importacoes/exportar-xlsx/${importacaoId}`;
  };

  return (
    <div className="container">
      <div className="header">
        <h1>📊 Importador XML de Produtos</h1>
        <p>Importe NF-e e calcule custos e preços de venda automaticamente</p>
      </div>

      {mensagem && (
        <div className={`alert alert-${mensagem.tipo}`}>
          {mensagem.tipo === 'info' && <span className="loading"></span>}
          {mensagem.tipo === 'success' && <span>✓</span>}
          {mensagem.tipo === 'error' && <span>✗</span>}
          {mensagem.texto}
        </div>
      )}

      {(estado === 'initial' || estado === 'pronto') && (
        <div className="content">
          <div className="form-group single">
            <label htmlFor="margem-global">Margem Global de Lucro (%)</label>
            <input
              id="margem-global"
              type="number"
              step="0.01"
              value={margemGlobal}
              onChange={(e) => setMargemGlobal(parseFloat(e.target.value) || 0)}
              disabled={estado === 'pronto'}
            />
          </div>

          {estado === 'initial' && (
            <>
              <UploadArea onUpload={handleUpload} margemGlobal={margemGlobal} />

              {freteManual !== '' && estado !== 'pronto' && (
                <div className="form-group single">
                  <label htmlFor="frete-manual">Frete Manual (R$)</label>
                  <input
                    id="frete-manual"
                    type="number"
                    step="0.01"
                    value={freteManual}
                    onChange={(e) => setFreteManual(e.target.value)}
                    placeholder="Digite o valor do frete se necessário"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {estado === 'pronto' && (
        <>
          <div className="content">
            <div className="form-group">
              <div>
                <label>NF-e: {cabecalho?.numeroNota || 'N/A'}</label>
                {cabecalho?.emitente && <p style={{ color: '#7f8c8d' }}>{cabecalho.emitente}</p>}
              </div>
              <div>
                <label>Frete do XML: R$ {freteTotal.toFixed(2)}</label>
                {freteTotal === 0 && (
                  <p style={{ color: '#e74c3c' }}>* Sem frete no XML. Edite manualmente se necessário.</p>
                )}
              </div>
            </div>

            <Resumo resumo={resumo} />

            <TabelaProdutos
              produtos={produtos}
              onAtualizar={handleAtualizarProduto}
            />

            <div className="button-group" style={{ marginTop: '20px' }}>
              <button className="btn-primary" onClick={handleSalvar}>
                💾 Salvar Importação
              </button>
              <button className="btn-secondary" onClick={() => setEstado('initial')}>
                ← Novo Upload
              </button>
            </div>
          </div>
        </>
      )}

      <div className="content">
        <Historico
          importacoes={importacoes}
          onExportarCSV={handleExportarCSV}
          onExportarXLSX={handleExportarXLSX}
          onAtualizar={carregarImportacoes}
        />
      </div>
    </div>
  );
}
