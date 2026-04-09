import { useDeferredValue, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebaseClient.js";
import { removeStoredFile, uploadImage } from "../../lib/storageUploads.js";
import {
  formatCurrency,
  formatRoundedCurrency,
  formatUppercaseText,
  getDateValue,
  getInitials,
  normalizeUppercaseText,
} from "../../shared/formatters.js";
import ActionsDropdown from "../components/ActionsDropdown.jsx";
import {
  CheckIcon,
  DownloadIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "../components/AdminIcons.jsx";
import DataTable from "../components/DataTable.jsx";
import { useAdminUI } from "../components/AdminLayout.jsx";
import FiltrosProdutos from "../components/FiltrosProdutos.jsx";
import ProductModal from "../components/ProductModal.jsx";
import SearchInput from "../components/SearchInput.jsx";
import Toolbar from "../components/Toolbar.jsx";
import { useCollectionData } from "../hooks/useFirestoreData.js";
import {
  formatOrigemProduto,
  formatOrigemProdutoDetailed,
  normalizeOrigemProdutoValue,
} from "../services/origemProdutoOptions.js";
import { resolveProductDescription } from "../services/productDescriptionService.js";
import { importRemoteProductImage } from "../services/productImageService.js";
import { downloadCsv } from "../utils/exportCsv.js";

function ProductIdentityCell({ product }) {
  return (
    <div className="admin-table-identity">
      <div className="admin-table-thumb">
        {product.imagem ? (
          <img
            src={product.imagem}
            alt={product.nome}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span>{getInitials(product.nome)}</span>
        )}
      </div>

      <div className="admin-table-copy">
        <strong>{formatUppercaseText(product.nome, "PRODUTO SEM NOME")}</strong>
        <span className="admin-table-subtitle">
          {formatUppercaseText(
            resolveProductDescription(product),
            "DESCRICAO NAO INFORMADA.",
          )}
        </span>

        <div className="admin-table-badges">
          <span
            className={`admin-badge ${product.ativo !== false ? "is-live" : "is-muted"}`}
          >
            {product.ativo !== false ? "Ativo" : "Inativo"}
          </span>
          {product.destaque ? (
            <span className="admin-badge is-accent">Destaque</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProductStockCell({ product }) {
  const hasStoredValue =
    product.estoque !== "" &&
    product.estoque !== null &&
    product.estoque !== undefined;
  const stockValue = hasStoredValue ? Number(product.estoque) : Number.NaN;
  const hasInventoryControl = Number.isFinite(stockValue);

  return (
    <div className="admin-table-stack">
      <strong>{hasInventoryControl ? stockValue : "--"}</strong>
      <span>{hasInventoryControl ? "unidades" : "Sem controle"}</span>
    </div>
  );
}

function listOptions(values) {
  return [
    ...new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean),
    ),
  ].sort((first, second) => first.localeCompare(second, "pt-BR"));
}

function buildFileStamp() {
  return new Date().toISOString().slice(0, 10);
}

const initialFilters = {
  category: "all",
  dataEntradaAte: "",
  dataEntradaDe: "",
  featured: "all",
  numeroNota: "",
  sector: "all",
  status: "all",
};

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

export default function ProductsPage() {
  const { data: products, loading } = useCollectionData("produtos");
  const { notify } = useAdminUI();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const categories = useMemo(
    () => listOptions(products.map((product) => product.categoria)),
    [products],
  );
  const sectors = useMemo(
    () => listOptions(products.map((product) => product.setor)),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    return [...products]
      .sort((first, second) => {
        if (first.destaque !== second.destaque) {
          return Number(second.destaque) - Number(first.destaque);
        }

        const secondDate =
          getDateValue(second.updatedAt || second.createdAt)?.getTime() || 0;
        const firstDate =
          getDateValue(first.updatedAt || first.createdAt)?.getTime() || 0;
        return secondDate - firstDate;
      })
      .filter((product) => {
        const category = String(product.categoria || "").trim();
        const sector = String(product.setor || "").trim();
        const isActive = product.ativo !== false;
        const ultimaNotaCompra = String(product.ultimaNotaCompra || "").trim();
        const ultimaDataEntrada = String(product.ultimaDataEntrada || "").slice(
          0,
          10,
        );

        if (normalizedSearch) {
          const haystack = [
            product.nome,
            category,
            sector,
            resolveProductDescription(product),
            product.codigoProduto,
            product.ncm,
            product.cest,
            ultimaNotaCompra,
            ultimaDataEntrada,
            product.origemProduto,
            formatOrigemProduto(product.origemProduto),
            formatOrigemProdutoDetailed(product.origemProduto),
          ]
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(normalizedSearch)) {
            return false;
          }
        }

        if (filters.status === "active" && !isActive) {
          return false;
        }

        if (filters.status === "inactive" && isActive) {
          return false;
        }

        if (filters.featured === "featured" && !product.destaque) {
          return false;
        }

        if (filters.featured === "regular" && product.destaque) {
          return false;
        }

        if (filters.category !== "all" && category !== filters.category) {
          return false;
        }

        if (filters.sector !== "all" && sector !== filters.sector) {
          return false;
        }

        if (
          filters.numeroNota &&
          !ultimaNotaCompra.includes(filters.numeroNota.trim())
        ) {
          return false;
        }

        if (
          (filters.dataEntradaDe || filters.dataEntradaAte) &&
          !matchesDateRange(
            ultimaDataEntrada,
            filters.dataEntradaDe,
            filters.dataEntradaAte,
          )
        ) {
          return false;
        }

        return true;
      });
  }, [deferredSearch, filters, products]);

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== initialFilters[key] && Boolean(value),
  ).length;

  const columns = [
    {
      key: "nome",
      header: "PRODUTO",
      mobileLabel: "Produto",
      cell: (product) => <ProductIdentityCell product={product} />,
    },
    {
      key: "categoria",
      header: "Categoria",
      cell: (product) => (
        <div className="admin-table-stack">
          <strong>
            {formatUppercaseText(product.categoria, "SEM CATEGORIA")}
          </strong>
          <span>CLASSIFICACAO PRINCIPAL</span>
        </div>
      ),
    },
    {
      key: "setor",
      header: "Setor",
      cell: (product) => (
        <div className="admin-table-stack">
          <strong>{formatUppercaseText(product.setor, "SEM SETOR")}</strong>
          <span>SEGMENTO INTERNO</span>
        </div>
      ),
    },
    {
      key: "preco",
      header: "Preco",
      cell: (product) => (
        <strong className="admin-table-price">
          {formatRoundedCurrency(product.precoVenda ?? product.preco)}
        </strong>
      ),
    },
    {
      key: "estoque",
      header: "Estoque",
      cell: (product) => <ProductStockCell product={product} />,
    },
    {
      key: "actions",
      header: "Acoes",
      mobileLabel: "Acoes",
      cellClassName: "is-actions",
      cell: (product) => (
        <div className="admin-table-actions">
          <button
            type="button"
            className="admin-icon-btn"
            onClick={() => openEditProduct(product)}
            aria-label={`Editar ${product.nome}`}
          >
            <EditIcon className="admin-inline-icon" />
          </button>
          <button
            type="button"
            className="admin-icon-btn"
            onClick={() => toggleProductStatus(product)}
            aria-label={
              product.ativo !== false
                ? `Desativar ${product.nome}`
                : `Ativar ${product.nome}`
            }
          >
            <CheckIcon className="admin-inline-icon" />
          </button>
          <button
            type="button"
            className="admin-icon-btn is-danger"
            onClick={() => deleteProduct(product)}
            aria-label={`Excluir ${product.nome}`}
          >
            <TrashIcon className="admin-inline-icon" />
          </button>
        </div>
      ),
    },
  ];

  function openNewProduct() {
    setEditingProduct(null);
    setModalOpen(true);
  }

  function openEditProduct(product) {
    setEditingProduct(product);
    setModalOpen(true);
  }

  async function deleteAllProducts() {
    if (!products.length || bulkDeleting) {
      return;
    }

    const confirmation = window.prompt(
      `Excluir TODOS os ${products.length} produtos do catalogo? Digite EXCLUIR TODOS para confirmar.`,
    );

    if (confirmation !== "EXCLUIR TODOS") {
      return;
    }

    setBulkDeleting(true);
    let deletedCount = 0;

    try {
      for (let index = 0; index < products.length; index += 400) {
        const chunk = products.slice(index, index + 400);
        const batch = writeBatch(db);

        chunk.forEach((product) => {
          batch.delete(doc(db, "produtos", product.id));
        });

        await batch.commit();
        deletedCount += chunk.length;
      }

      const storageResults = await Promise.allSettled(
        products
          .filter((product) => product.imagemPath)
          .map((product) => removeStoredFile(product.imagemPath)),
      );

      const storageFailures = storageResults.filter(
        (result) => result.status === "rejected",
      ).length;

      notify({
        type: storageFailures ? "error" : "success",
        title: storageFailures
          ? "Catalogo removido com pendencias"
          : "Todos os produtos foram excluidos",
        description: storageFailures
          ? `${deletedCount} produto(s) removidos. ${storageFailures} imagem(ns) nao puderam ser limpas do Storage.`
          : `${deletedCount} produto(s) foram removidos do catalogo.`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Nao foi possivel excluir todos os produtos",
        description:
          deletedCount > 0
            ? `${deletedCount} produto(s) ja tinham sido removidos antes da falha. ${error.message || "Revise e tente novamente."}`
            : error.message || "Revise e tente novamente.",
      });
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleSaveProduct(draft) {
    setSaving(true);

    try {
      const hasExistingProduct = Boolean(editingProduct?.id);
      const productRef = hasExistingProduct
        ? doc(db, "produtos", editingProduct.id)
        : doc(collection(db, "produtos"));
      let imageUrl = editingProduct?.imagem || "";
      let imagePath = editingProduct?.imagemPath || "";

      if (draft.removeImage && imagePath) {
        await removeStoredFile(imagePath);
        imageUrl = "";
        imagePath = "";
      }

      if (draft.selectedSearchImage?.imageUrl) {
        const importedImage = await importRemoteProductImage({
          fallbackUrl: draft.selectedSearchImage.thumbnailUrl || "",
          imageUrl: draft.selectedSearchImage.imageUrl,
          productId: productRef.id,
          productName: draft.nome.trim(),
        });

        if (imagePath && imagePath !== importedImage.path) {
          await removeStoredFile(imagePath);
        }

        imageUrl = importedImage.url;
        imagePath = importedImage.path;
      }

      if (draft.imageFile) {
        const uploaded = await uploadImage(
          draft.imageFile,
          `products/${productRef.id}`,
        );

        if (imagePath && imagePath !== uploaded.path) {
          await removeStoredFile(imagePath);
        }

        imageUrl = uploaded.url;
        imagePath = uploaded.path;
      }

      const payload = {
        nome: normalizeUppercaseText(draft.nome),
        descricao: normalizeUppercaseText(resolveProductDescription(draft)),
        preco: Number.isFinite(draft.precoVenda)
          ? draft.precoVenda
          : Number.isFinite(draft.preco)
            ? draft.preco
            : 0,
        precoVenda: Number.isFinite(draft.precoVenda)
          ? draft.precoVenda
          : Number.isFinite(draft.preco)
            ? draft.preco
            : 0,
        categoria: normalizeUppercaseText(draft.categoria),
        setor: normalizeUppercaseText(draft.setor),
        estoque: Number.isFinite(draft.estoque) ? draft.estoque : null,
        codigoProduto: normalizeUppercaseText(draft.codigoProduto),
        ncm: normalizeUppercaseText(draft.ncm),
        cest: normalizeUppercaseText(draft.cest),
        origemProduto:
          normalizeOrigemProdutoValue(draft.origemProduto) ||
          draft.origemProduto?.trim() ||
          "",
        custoReal: Number.isFinite(draft.custoReal) ? draft.custoReal : null,
        margemPadrao: Number.isFinite(draft.margemPadrao)
          ? draft.margemPadrao
          : null,
        destaque: Boolean(draft.destaque),
        ativo: Boolean(draft.ativo),
        imagem: imageUrl,
        imagemPath: imagePath,
        updatedAt: serverTimestamp(),
      };

      if (hasExistingProduct) {
        await updateDoc(productRef, payload);
      } else {
        await setDoc(productRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      notify({
        type: "success",
        title: hasExistingProduct ? "Produto atualizado" : "Produto criado",
        description: `${draft.nome} esta pronto para uso no catalogo.`,
      });

      setModalOpen(false);
      setEditingProduct(null);
    } catch (error) {
      notify({
        type: "error",
        title: "Nao foi possivel salvar o produto",
        description: error.message || "Revise os dados e tente novamente.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleProductStatus(product) {
    try {
      await updateDoc(doc(db, "produtos", product.id), {
        ativo: !(product.ativo !== false),
        updatedAt: serverTimestamp(),
      });

      notify({
        type: "success",
        title:
          product.ativo !== false ? "Produto desativado" : "Produto ativado",
        description: product.nome,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Nao foi possivel atualizar o status",
        description: error.message || "Tente novamente.",
      });
    }
  }

  async function deleteProduct(product) {
    const confirmed = window.confirm(`Excluir "${product.nome}" do catalogo?`);

    if (!confirmed) {
      return;
    }

    try {
      if (product.imagemPath) {
        await removeStoredFile(product.imagemPath);
      }

      await deleteDoc(doc(db, "produtos", product.id));

      notify({
        type: "success",
        title: "Produto excluido",
        description: `${product.nome} foi removido do catalogo.`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Nao foi possivel excluir o produto",
        description: error.message || "Tente novamente.",
      });
    }
  }

  function clearFilters() {
    setFilters(initialFilters);
  }

  function exportProducts() {
    downloadCsv({
      filename: `produtos-${buildFileStamp()}.csv`,
      columns: [
        { label: "Nome", value: (product) => product.nome },
        { label: "Codigo", value: (product) => product.codigoProduto || "" },
        { label: "Categoria", value: (product) => product.categoria || "" },
        { label: "Setor", value: (product) => product.setor || "" },
        { label: "NCM", value: (product) => product.ncm || "" },
        { label: "CEST", value: (product) => product.cest || "" },
        {
          label: "Origem",
          value: (product) =>
            formatOrigemProdutoDetailed(product.origemProduto) || "",
        },
        {
          label: "Custo real",
          value: (product) => formatCurrency(product.custoReal),
        },
        {
          label: "Margem padrao",
          value: (product) => product.margemPadrao ?? "",
        },
        {
          label: "Preco",
          value: (product) =>
            formatRoundedCurrency(product.precoVenda ?? product.preco),
        },
        { label: "Estoque", value: (product) => product.estoque ?? "" },
        {
          label: "Status",
          value: (product) => (product.ativo !== false ? "Ativo" : "Inativo"),
        },
        {
          label: "Destaque",
          value: (product) => (product.destaque ? "Sim" : "Nao"),
        },
      ],
      rows: filteredProducts,
    });

    notify({
      type: "success",
      title: "Exportacao concluida",
      description: `${filteredProducts.length} produto(s) foram preparados em CSV.`,
    });
  }

  const actionItems = [
    {
      id: "new",
      label: "Novo produto",
      icon: PlusIcon,
      onSelect: openNewProduct,
    },
    {
      id: "export",
      label: "Exportar",
      icon: DownloadIcon,
      disabled: bulkDeleting || !filteredProducts.length,
      onSelect: exportProducts,
    },
    {
      id: "delete-all",
      label: "Excluir todos produtos",
      icon: TrashIcon,
      tone: "danger",
      disabled: bulkDeleting || !products.length,
      onSelect: deleteAllProducts,
    },
  ];

  return (
    <section className="admin-page-section admin-list-page">
      <div className="admin-page-header">
        <div>
          <span className="admin-kicker">Produtos</span>
        </div>
      </div>

      <Toolbar
        search={
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Procurar por produto, categoria, setor, codigo, NCM ou nota..."
            ariaLabel="Procurar produtos"
          />
        }
        filters={
          <FiltrosProdutos
            activeCount={activeFilterCount}
            categories={categories}
            filters={filters}
            onClear={clearFilters}
            onChange={setFilters}
            sectors={sectors}
          />
        }
        actions={
          <ActionsDropdown
            items={actionItems}
            ariaLabel="Abrir acoes de produtos"
          />
        }
      />

      <DataTable
        caption="Tabela de produtos"
        columns={columns}
        rows={filteredProducts}
        loading={loading}
        loadingState="Carregando catalogo..."
        emptyState="Nenhum produto encontrado com esse filtro."
      />

      <ProductModal
        categories={categories}
        open={modalOpen}
        product={editingProduct}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setModalOpen(false);
            setEditingProduct(null);
          }
        }}
        sectors={sectors}
        onSave={handleSaveProduct}
      />
    </section>
  );
}
