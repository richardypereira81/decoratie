import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebaseClient.js";
import { removeStoredFile, uploadImage } from "../../lib/storageUploads.js";
import {
  formatDisplayText,
  formatCurrency,
  formatRoundedCurrency,
  formatUppercaseText,
  getDateValue,
  getInitials,
  normalizeUppercaseText,
} from "../../shared/formatters.js";
import {
  getPrimaryProductCategory,
  normalizeProductCategories,
  productMatchesCategory,
  UNCATEGORIZED_CATEGORY_FILTER,
} from "../../shared/productCategories.js";
import {
  hasProductCategory,
  hasProductImage,
  isProductStoreVisible,
} from "../../shared/productVisibility.js";
import ActionsDropdown from "../components/ActionsDropdown.jsx";
import {
  DownloadIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "../components/AdminIcons.jsx";
import DataTable from "../components/DataTable.jsx";
import { useAdminUI } from "../components/AdminLayout.jsx";
import FiltrosProdutos from "../components/FiltrosProdutos.jsx";
import Modal from "../components/Modal.jsx";
import ProductModal from "../components/ProductModal.jsx";
import SearchInput from "../components/SearchInput.jsx";
import Toolbar from "../components/Toolbar.jsx";
import { useCollectionData } from "../hooks/useFirestoreData.js";
import {
  formatOrigemProduto,
  formatOrigemProdutoDetailed,
  normalizeOrigemProdutoValue,
} from "../services/origemProdutoOptions.js";
import { calcularPrecoVenda, round2 } from "../services/custoService.js";
import { resolveProductDescription } from "../services/productDescriptionService.js";
import { importRemoteProductImage } from "../services/productImageService.js";
import { downloadCsv } from "../utils/exportCsv.js";

function ProductIdentityCell({ product }) {
  const storeVisible = isProductStoreVisible(product);
  const missingCategory = !hasProductCategory(product);
  const missingImage = !hasProductImage(product);
  const lowMargin = hasLowProductMargin(product);

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
          {formatDisplayText(resolveProductDescription(product)) || "Descricao nao informada."}
        </span>

        <div className="admin-table-badges">
          <span
            className={`admin-badge ${storeVisible ? "is-live" : "is-muted"}`}
          >
            {product.ativo === false ? "Inativo" : storeVisible ? "Ativo" : "Invisivel na loja"}
          </span>
          {missingCategory ? (
            <span className="admin-badge is-muted">Sem categoria</span>
          ) : null}
          {missingImage ? (
            <span className="admin-badge is-muted">Sem foto</span>
          ) : null}
          {lowMargin ? (
            <span className="admin-badge is-danger">Margem abaixo de 100%</span>
          ) : null}
          {product.destaque ? (
            <span className="admin-badge is-accent">Destaque</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getStockValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.floor(numericValue)
    : 0;
}

function ProductStockCell({ disabled = false, onAdjust, product, stockOverride }) {
  const stockValue = getStockValue(stockOverride ?? product.estoque);
  const productName = formatUppercaseText(product.nome, "produto");

  return (
    <div className={`admin-stock-control ${disabled ? "is-saving" : ""}`}>
      <button
        type="button"
        className="admin-stock-btn"
        onClick={() => onAdjust(product, -1)}
        disabled={disabled || stockValue <= 0}
        aria-label={`Diminuir estoque de ${productName}`}
      >
        -
      </button>

      <div className="admin-stock-value" aria-live="polite">
        <strong>{stockValue}</strong>
        <span>{disabled ? "Salvando" : "unidades"}</span>
      </div>

      <button
        type="button"
        className="admin-stock-btn"
        onClick={() => onAdjust(product, 1)}
        disabled={disabled}
        aria-label={`Aumentar estoque de ${productName}`}
      >
        +
      </button>
    </div>
  );
}

function listOptions(values) {
  return [
    ...new Set(
      values.flatMap((value) => (
        Array.isArray(value)
          ? normalizeProductCategories(value)
          : [String(value || "").trim()].filter(Boolean)
      )),
    ),
  ].sort((first, second) => first.localeCompare(second, "pt-BR"));
}

function getProductCategories(product) {
  return normalizeProductCategories(product);
}

function formatProductCategories(product) {
  const categories = getProductCategories(product);

  if (!categories.length) {
    return "SEM CATEGORIA";
  }

  if (categories.length <= 2) {
    return categories.join(", ");
  }

  return `${categories.slice(0, 2).join(", ")} +${categories.length - 2}`;
}

function buildFileStamp() {
  return new Date().toISOString().slice(0, 10);
}

function getProductCostValue(product) {
  if (
    product?.custoReal === "" ||
    product?.custoReal === null ||
    product?.custoReal === undefined
  ) {
    return null;
  }

  const cost = Number(product.custoReal);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

function getProductSalePriceValue(product) {
  const rawPrice =
    product?.precoVenda === "" ||
    product?.precoVenda === null ||
    product?.precoVenda === undefined
      ? product?.preco
      : product.precoVenda;

  if (rawPrice === "" || rawPrice === null || rawPrice === undefined) {
    return null;
  }

  const price = Number(rawPrice);
  return Number.isFinite(price) ? price : null;
}

function hasLowProductMargin(product) {
  const cost = getProductCostValue(product);
  const price = getProductSalePriceValue(product);

  if (cost === null || cost <= 0 || price === null) {
    return false;
  }

  return price < calcularPrecoVenda(cost, 100);
}

const initialFilters = {
  category: "all",
  dataEntradaAte: "",
  dataEntradaDe: "",
  featured: "all",
  margin: "all",
  numeroNota: "",
  photo: "all",
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
  const [bulkPriceModalOpen, setBulkPriceModalOpen] = useState(false);
  const [bulkPricePercent, setBulkPricePercent] = useState("");
  const [bulkPriceSaving, setBulkPriceSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [stockAdjusting, setStockAdjusting] = useState({});
  const [stockOverrides, setStockOverrides] = useState({});
  const deferredSearch = useDeferredValue(search);

  const categories = useMemo(
    () => listOptions(products.flatMap((product) => getProductCategories(product))),
    [products],
  );
  const sectors = useMemo(
    () => listOptions(products.map((product) => product.setor)),
    [products],
  );

  useEffect(() => {
    setStockOverrides((current) => {
      let changed = false;
      const next = { ...current };

      products.forEach((product) => {
        if (
          next[product.id] !== undefined &&
          getStockValue(product.estoque) === next[product.id]
        ) {
          delete next[product.id];
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [products]);

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
        const productCategories = getProductCategories(product);
        const categoryText = productCategories.join(" ");
        const hasImage = hasProductImage(product);
        const lowMargin = hasLowProductMargin(product);
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
            categoryText,
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

        if (
          filters.category === UNCATEGORIZED_CATEGORY_FILTER &&
          productCategories.length
        ) {
          return false;
        }

        if (
          filters.category !== "all" &&
          filters.category !== UNCATEGORIZED_CATEGORY_FILTER &&
          !productMatchesCategory(product, filters.category)
        ) {
          return false;
        }

        if (filters.photo === "with_photo" && !hasImage) {
          return false;
        }

        if (filters.photo === "without_photo" && hasImage) {
          return false;
        }

        if (filters.margin === "below_100" && !lowMargin) {
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
  const bulkPriceProducts = useMemo(
    () => filteredProducts.filter((product) => product.id && getProductCostValue(product) !== null),
    [filteredProducts],
  );
  const bulkPricePreview = useMemo(() => {
    const margin = Number(bulkPricePercent);

    if (!Number.isFinite(margin) || margin < 0) {
      return [];
    }

    return bulkPriceProducts.map((product) => {
      const cost = getProductCostValue(product);

      return {
        cost,
        id: product.id,
        name: product.nome || "Produto",
        currentPrice: getProductSalePriceValue(product),
        nextPrice: calcularPrecoVenda(cost, margin),
      };
    });
  }, [bulkPricePercent, bulkPriceProducts]);

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
            {formatUppercaseText(formatProductCategories(product), "SEM CATEGORIA")}
          </strong>
          <span>{getProductCategories(product).length > 1 ? "MULTIPLAS CATEGORIAS" : "CLASSIFICACAO PRINCIPAL"}</span>
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
      cell: (product) => (
        <ProductStockCell
          disabled={Boolean(stockAdjusting[product.id])}
          product={product}
          stockOverride={stockOverrides[product.id]}
          onAdjust={adjustProductStock}
        />
      ),
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

  function openBulkPriceAdjustment() {
    setBulkPricePercent("");
    setBulkPriceModalOpen(true);
  }

  function closeBulkPriceAdjustment() {
    if (bulkPriceSaving) {
      return;
    }

    setBulkPriceModalOpen(false);
    setBulkPricePercent("");
  }

  async function adjustProductStock(product, delta) {
    if (!product?.id || stockAdjusting[product.id]) {
      return;
    }

    const previousStock = getStockValue(stockOverrides[product.id] ?? product.estoque);
    const optimisticStock = Math.max(0, previousStock + delta);

    if (delta < 0 && previousStock <= 0) {
      return;
    }

    setStockAdjusting((current) => ({ ...current, [product.id]: true }));
    setStockOverrides((current) => ({ ...current, [product.id]: optimisticStock }));

    try {
      const productRef = doc(db, "produtos", product.id);
      const savedStock = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(productRef);

        if (!snapshot.exists()) {
          throw new Error("Produto nao encontrado.");
        }

        const currentStock = getStockValue(snapshot.data().estoque);
        const nextStock = Math.max(0, currentStock + delta);

        transaction.update(productRef, {
          estoque: nextStock,
          updatedAt: serverTimestamp(),
        });

        return nextStock;
      });

      setStockOverrides((current) => ({ ...current, [product.id]: savedStock }));
    } catch (error) {
      setStockOverrides((current) => ({ ...current, [product.id]: previousStock }));
      notify({
        type: "error",
        title: "Nao foi possivel ajustar o estoque",
        description: error.message || "Tente novamente.",
      });
    } finally {
      setStockAdjusting((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    }
  }

  async function handleBulkPriceAdjustment(event) {
    event.preventDefault();

    const numericMargin = Number(bulkPricePercent);

    if (!Number.isFinite(numericMargin) || numericMargin < 0) {
      notify({
        type: "error",
        title: "Percentual invalido",
        description: "Informe uma margem maior ou igual a 0.",
      });
      return;
    }

    const margin = round2(numericMargin);

    if (!bulkPriceProducts.length) {
      notify({
        type: "error",
        title: "Nenhum produto ajustavel",
        description: "Os produtos exibidos precisam ter custo real informado.",
      });
      return;
    }

    const skippedCount = filteredProducts.length - bulkPriceProducts.length;
    const confirmed = window.confirm(
      `Aplicar margem de ${margin}% em ${bulkPriceProducts.length} produto(s) exibido(s)?` +
        (skippedCount > 0 ? ` ${skippedCount} produto(s) sem custo real serao ignorados.` : ""),
    );

    if (!confirmed) {
      return;
    }

    setBulkPriceSaving(true);
    let updatedCount = 0;

    try {
      for (let index = 0; index < bulkPriceProducts.length; index += 400) {
        const chunk = bulkPriceProducts.slice(index, index + 400);
        const batch = writeBatch(db);

        chunk.forEach((product) => {
          const cost = getProductCostValue(product);
          const price = calcularPrecoVenda(cost, margin);

          batch.update(doc(db, "produtos", product.id), {
            margemPadrao: margin,
            precoVenda: price,
            preco: price,
            updatedAt: serverTimestamp(),
          });
        });

        await batch.commit();
        updatedCount += chunk.length;
      }

      notify({
        type: "success",
        title: "Ajuste em massa aplicado",
        description: `${updatedCount} produto(s) atualizado(s) com margem de ${margin}%.`,
      });

      setBulkPriceModalOpen(false);
      setBulkPricePercent("");
    } catch (error) {
      notify({
        type: "error",
        title: "Nao foi possivel aplicar o ajuste",
        description: updatedCount > 0
          ? `${updatedCount} produto(s) ja tinham sido atualizados antes da falha. ${error.message || "Revise e tente novamente."}`
          : error.message || "Revise e tente novamente.",
      });
    } finally {
      setBulkPriceSaving(false);
    }
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

      const selectedCategories = normalizeProductCategories(
        draft.categorias,
        draft.categoria,
      );

      if (!selectedCategories.length) {
        throw new Error("Selecione pelo menos uma categoria.");
      }

      const payload = {
        nome: normalizeUppercaseText(draft.nome),
        descricao: formatDisplayText(resolveProductDescription(draft)),
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
        categoria: selectedCategories[0],
        categorias: selectedCategories,
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
        peso: Number.isFinite(draft.peso) ? draft.peso : null,
        altura: Number.isFinite(draft.altura) ? draft.altura : null,
        largura: Number.isFinite(draft.largura) ? draft.largura : null,
        comprimento: Number.isFinite(draft.comprimento)
          ? draft.comprimento
          : null,
        destaque: Boolean(draft.destaque),
        ativo: Boolean(draft.ativo),
        imagem: imageUrl,
        imagemPath: imagePath,
        updatedAt: serverTimestamp(),
      };
      const willBeVisibleInStore = isProductStoreVisible(payload);

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
        description: willBeVisibleInStore
          ? `${draft.nome} esta pronto para uso no catalogo.`
          : `${draft.nome} foi salvo, mas fica invisivel na loja ate ter categoria e foto.`,
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
        { label: "Categoria", value: (product) => getPrimaryProductCategory(product) },
        { label: "Categorias", value: (product) => getProductCategories(product).join(", ") },
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
        { label: "Peso kg", value: (product) => product.peso ?? "" },
        { label: "Altura cm", value: (product) => product.altura ?? "" },
        { label: "Largura cm", value: (product) => product.largura ?? "" },
        {
          label: "Comprimento cm",
          value: (product) => product.comprimento ?? "",
        },
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
      id: "bulk-price-adjustment",
      label: "Ajuste em massa",
      icon: EditIcon,
      disabled: bulkDeleting || bulkPriceSaving || !filteredProducts.length,
      onSelect: openBulkPriceAdjustment,
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
        recordCount={filteredProducts.length}
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

      <Modal
        open={bulkPriceModalOpen}
        onClose={closeBulkPriceAdjustment}
        title="Ajuste em massa"
        width="small"
      >
        <form className="admin-form admin-modal-body" onSubmit={handleBulkPriceAdjustment}>
          <div className="admin-inline-notice admin-bulk-price-summary">
            <strong>{filteredProducts.length} produto(s) exibido(s)</strong>
            <span>{bulkPriceProducts.length} com custo real para recalcular</span>
          </div>

          <label className="admin-field">
            <span>Margem sobre custo real (%)</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.01"
              value={bulkPricePercent}
              onChange={(event) => setBulkPricePercent(event.target.value)}
              placeholder="Ex.: 25"
              required
            />
          </label>

          {bulkPricePreview.length ? (
            <div className="admin-bulk-price-preview">
              <div className="admin-bulk-price-preview-head">
                <strong>Previa</strong>
                <span>{bulkPricePreview.length} item(s)</span>
              </div>

              <div className="admin-bulk-price-preview-list">
                {bulkPricePreview.map((item) => (
                  <div className="admin-bulk-price-preview-item" key={item.id}>
                    <strong>{formatUppercaseText(item.name)}</strong>
                    <div className="admin-bulk-price-preview-values">
                      <span>
                        <small>Custo</small>
                        {formatCurrency(item.cost)}
                      </span>
                      <span>
                        <small>Venda atual</small>
                        {formatCurrency(item.currentPrice)}
                      </span>
                      <span>
                        <small>Nova venda</small>
                        {formatCurrency(item.nextPrice)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="admin-modal-actions">
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={closeBulkPriceAdjustment}
              disabled={bulkPriceSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="admin-btn"
              disabled={bulkPriceSaving || !bulkPriceProducts.length}
            >
              {bulkPriceSaving ? "Aplicando..." : "Aplicar ajuste"}
            </button>
          </div>
        </form>
      </Modal>

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
