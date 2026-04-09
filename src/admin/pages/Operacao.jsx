import { useDeferredValue, useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "../../shared/formatters.js";
import ActionsDropdown from "../components/ActionsDropdown.jsx";
import { useAdminUI } from "../components/AdminLayout.jsx";
import {
  DownloadIcon,
  OperationIcon,
  UploadIcon,
} from "../components/AdminIcons.jsx";
import Modal from "../components/Modal.jsx";
import SearchInput from "../components/SearchInput.jsx";
import Toolbar from "../components/Toolbar.jsx";
import FiltrosOperacao from "../components/Operacao/FiltrosOperacao.jsx";
import ImportXMLModal from "../components/Operacao/ImportXMLModal.jsx";
import NotaDetalhe from "../components/Operacao/NotaDetalhe.jsx";
import NotaList from "../components/Operacao/NotaList.jsx";
import { useCollectionData } from "../hooks/useFirestoreData.js";
import {
  buildOperacaoFileName,
  excluirImportacao,
  exportarNotasCsv,
  exportarNotasXlsx,
  exportarRelatorioCsv,
  exportarRelatorioXlsx,
} from "../services/operacaoService.js";
import {
  construirComprasPorPeriodo,
  construirResumoOperacao,
  formatarPeriodo,
} from "../services/custoService.js";
import { normalizeSearchText } from "../services/xmlParser.js";

const initialFilters = {
  dataEntradaDe: "",
  dataEntradaAte: "",
  dataEmissaoDe: "",
  dataEmissaoAte: "",
  fornecedor: "",
  numeroNota: "",
  chaveNfe: "",
};

function normalizeImportacao(importacao) {
  const fornecedor = importacao.fornecedor || importacao.emitente || "";
  const chaveNfe = importacao.chaveNfe || importacao.chaveNota || "";
  const dataEntrada = String(
    importacao.dataEntrada || importacao.dataImportacao || "",
  ).slice(0, 10);
  const dataEmissao = String(importacao.dataEmissao || "").slice(0, 10);
  const produtosResumo = Array.isArray(importacao.produtosResumo)
    ? importacao.produtosResumo
    : [];

  return {
    ...importacao,
    fornecedor,
    chaveNfe,
    dataEntrada,
    dataEmissao,
    quantidadeTotal: importacao.quantidadeTotal ?? importacao.quantidade ?? 0,
    produtosResumo,
    searchIndex:
      importacao.searchIndex ||
      normalizeSearchText(
        `${fornecedor} ${importacao.numeroNota || ""} ${chaveNfe} ${produtosResumo.join(" ")}`,
      ),
  };
}

function matchesDateRange(value, start, end) {
  if (!value) {
    return false;
  }

  if (start && value < start) {
    return false;
  }

  if (end && value > end) {
    return false;
  }

  return true;
}

export default function Operacao() {
  const { data: importacoes, loading } = useCollectionData("importacoes");
  const { notify } = useAdminUI();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [selectedNota, setSelectedNota] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState("");
  const deferredSearch = useDeferredValue(search);

  const normalizedImportacoes = useMemo(
    () => importacoes.map(normalizeImportacao),
    [importacoes],
  );

  const fornecedores = useMemo(
    () =>
      [
        ...new Set(
          normalizedImportacoes
            .map((importacao) => String(importacao.fornecedor || "").trim())
            .filter(Boolean),
        ),
      ].sort((first, second) => first.localeCompare(second, "pt-BR")),
    [normalizedImportacoes],
  );

  const filteredNotas = useMemo(() => {
    const normalizedSearch = normalizeSearchText(deferredSearch);

    return [...normalizedImportacoes]
      .sort((first, second) =>
        String(second.dataEntrada || second.dataEmissao || "").localeCompare(
          String(first.dataEntrada || first.dataEmissao || ""),
        ),
      )
      .filter((importacao) => {
        const searchIndex = normalizeSearchText(importacao.searchIndex || "");
        const fallbackSearch = normalizeSearchText(
          `${importacao.fornecedor} ${importacao.numeroNota} ${importacao.chaveNfe} ${(importacao.produtosResumo || []).join(" ")}`,
        );
        const fornecedor = normalizeSearchText(importacao.fornecedor);
        const numeroNota = String(importacao.numeroNota || "").trim();
        const chaveNfe = String(importacao.chaveNfe || "").trim();

        if (
          normalizedSearch &&
          !searchIndex.includes(normalizedSearch) &&
          !fallbackSearch.includes(normalizedSearch)
        ) {
          return false;
        }

        if (
          (filters.dataEntradaDe || filters.dataEntradaAte) &&
          !matchesDateRange(
            String(importacao.dataEntrada || ""),
            filters.dataEntradaDe,
            filters.dataEntradaAte,
          )
        ) {
          return false;
        }

        if (
          (filters.dataEmissaoDe || filters.dataEmissaoAte) &&
          !matchesDateRange(
            String(importacao.dataEmissao || ""),
            filters.dataEmissaoDe,
            filters.dataEmissaoAte,
          )
        ) {
          return false;
        }

        if (
          filters.fornecedor &&
          !fornecedor.includes(normalizeSearchText(filters.fornecedor))
        ) {
          return false;
        }

        if (
          filters.numeroNota &&
          !numeroNota.includes(filters.numeroNota.trim())
        ) {
          return false;
        }

        if (filters.chaveNfe && !chaveNfe.includes(filters.chaveNfe.trim())) {
          return false;
        }

        return true;
      });
  }, [deferredSearch, filters, normalizedImportacoes]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const resumo = useMemo(
    () => construirResumoOperacao(filteredNotas),
    [filteredNotas],
  );
  const comprasPorPeriodo = useMemo(
    () => construirComprasPorPeriodo(filteredNotas).slice(0, 6),
    [filteredNotas],
  );

  const actionItems = [
    {
      id: "import",
      label: "Importar XML",
      icon: UploadIcon,
      onSelect: () => setImportModalOpen(true),
    },
    {
      id: "report",
      label: "Gerar relatorio",
      icon: OperationIcon,
      onSelect: () => setReportModalOpen(true),
    },
    {
      id: "export",
      label: "Exportar dados",
      icon: DownloadIcon,
      onSelect: () => setExportModalOpen(true),
    },
  ];

  async function handleDeleteNote(nota) {
    const numeroNota = nota?.numeroNota || "sem numero";
    const confirmed = window.confirm(
      `Excluir a entrada da nota "${numeroNota}"? Isso remove a nota e os itens importados. Os produtos atualizados por essa importacao nao serao revertidos automaticamente.`,
    );

    if (!confirmed || !nota?.id) {
      return;
    }

    setDeletingNoteId(nota.id);

    try {
      await excluirImportacao(nota.id);

      if (selectedNota?.id === nota.id) {
        setSelectedNota(null);
      }

      notify({
        type: "success",
        title: "Entrada excluida",
        description: `A nota ${numeroNota} foi removida do historico de importacoes.`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Nao foi possivel excluir a entrada",
        description: error.message || "Tente novamente em alguns instantes.",
      });
    } finally {
      setDeletingNoteId("");
    }
  }

  return (
    <section className="admin-page-section admin-list-page">
      <div className="admin-page-header">
        <div>
          <span className="admin-kicker">Operacao</span>
        </div>
      </div>

      <Toolbar
        search={
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Procurar por fornecedor, numero da nota, chave NF-e ou produto..."
            ariaLabel="Procurar notas de entrada"
          />
        }
        filters={
          <FiltrosOperacao
            activeCount={activeFilterCount}
            filters={filters}
            fornecedores={fornecedores}
            onChange={setFilters}
            onClear={() => setFilters(initialFilters)}
          />
        }
        actions={
          <ActionsDropdown
            items={actionItems}
            ariaLabel="Abrir acoes de operacao"
          />
        }
      />

      <NotaList
        deletingNoteId={deletingNoteId}
        loading={loading}
        notas={filteredNotas}
        onDeleteNote={handleDeleteNote}
        onOpenNote={setSelectedNota}
      />

      <ImportXMLModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={() => setImportModalOpen(false)}
      />

      <NotaDetalhe
        open={Boolean(selectedNota)}
        nota={selectedNota}
        onClose={() => setSelectedNota(null)}
      />

      <Modal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        title="Relatorio de operacao"
        width="large"
      >
        <div className="admin-form admin-modal-body">
          <div className="admin-stats-grid admin-operacao-stats-grid">
            <article className="admin-stat-card">
              <div>
                <span>Compras por periodo</span>
                <strong>{resumo.totalNotas}</strong>
                <small>Notas consideradas no filtro atual</small>
              </div>
            </article>
            <article className="admin-stat-card">
              <div>
                <span>Custo medio</span>
                <strong>{formatCurrency(resumo.custoMedio)}</strong>
                <small>Media por unidade importada</small>
              </div>
            </article>
            <article className="admin-stat-card">
              <div>
                <span>Margem estimada</span>
                <strong>{formatNumber(resumo.margemEstimada)}%</strong>
                <small>Baseada no custo real e venda estimada</small>
              </div>
            </article>
            <article className="admin-stat-card">
              <div>
                <span>Total investido</span>
                <strong>{formatCurrency(resumo.totalInvestido)}</strong>
                <small>Somatorio do custo real das compras</small>
              </div>
            </article>
          </div>

          <article className="admin-surface">
            <div className="admin-surface-head">
              <div>
                <span className="admin-kicker">Compras por periodo</span>
                <h2>Recorte do filtro atual</h2>
              </div>
            </div>

            {comprasPorPeriodo.length ? (
              <div className="admin-summary-list">
                {comprasPorPeriodo.map((periodo) => (
                  <div key={periodo.periodo}>
                    <strong>{formatarPeriodo(periodo.periodo)}</strong>
                    <span>{`${periodo.totalNotas} nota(s) | Investido ${formatCurrency(periodo.totalInvestido)}`}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-empty-state">
                <p>Nenhuma nota encontrada para gerar o relatorio.</p>
              </div>
            )}
          </article>

          <div className="admin-inline-actions">
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() =>
                exportarRelatorioCsv(
                  filteredNotas,
                  `${buildOperacaoFileName("relatorio-operacao")}.csv`,
                )
              }
              disabled={!filteredNotas.length}
            >
              <DownloadIcon className="admin-inline-icon" />
              <span>Exportar CSV</span>
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() =>
                exportarRelatorioXlsx(
                  filteredNotas,
                  `${buildOperacaoFileName("relatorio-operacao")}.xlsx`,
                )
              }
              disabled={!filteredNotas.length}
            >
              <DownloadIcon className="admin-inline-icon" />
              <span>Exportar XLSX</span>
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Exportar dados de operacao"
        width="small"
      >
        <div className="admin-form admin-modal-body">
          <article className="admin-surface">
            <div className="admin-summary-list">
              <div>
                <strong>{filteredNotas.length}</strong>
                <span>Notas prontas para exportacao</span>
              </div>
              <div>
                <strong>{formatCurrency(resumo.totalInvestido)}</strong>
                <span>Total investido no recorte atual</span>
              </div>
            </div>
          </article>

          <div className="admin-inline-actions">
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() =>
                exportarNotasCsv(
                  filteredNotas,
                  `${buildOperacaoFileName("notas-operacao")}.csv`,
                )
              }
              disabled={!filteredNotas.length}
            >
              <DownloadIcon className="admin-inline-icon" />
              <span>Exportar CSV</span>
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={() =>
                exportarNotasXlsx(
                  filteredNotas,
                  `${buildOperacaoFileName("notas-operacao")}.xlsx`,
                )
              }
              disabled={!filteredNotas.length}
            >
              <DownloadIcon className="admin-inline-icon" />
              <span>Exportar XLSX</span>
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
