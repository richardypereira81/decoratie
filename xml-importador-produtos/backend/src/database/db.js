import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '../data/database.db');

export function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      db.serialize(() => {
        // Tabela de importações
        db.run(`
          CREATE TABLE IF NOT EXISTS importacoes (
            id TEXT PRIMARY KEY,
            chaveNota TEXT,
            numeroNota TEXT,
            emitente TEXT,
            dataEmissao TEXT,
            freteTotal REAL DEFAULT 0,
            freteManual REAL,
            margemGlobal REAL,
            dataImportacao TEXT,
            totalItens INTEGER,
            valorTotal REAL,
            ipiTotal REAL,
            custoTotal REAL,
            vendaTotal REAL
          )
        `, (err) => {
          if (err) console.error('Erro ao criar tabela importacoes:', err);
        });

        // Tabela de itens
        db.run(`
          CREATE TABLE IF NOT EXISTS importacao_itens (
            id TEXT PRIMARY KEY,
            importacaoId TEXT NOT NULL,
            cProd TEXT,
            xProd TEXT,
            ncm TEXT,
            cfop TEXT,
            unidade TEXT,
            quantidade REAL,
            valorUnitarioXml REAL,
            valorTotalItem REAL,
            ipiTotal REAL,
            freteRateado REAL,
            custoBaseUnitario REAL,
            ipiUnitario REAL,
            freteUnitario REAL,
            custoRealUnitario REAL,
            margem REAL,
            valorVenda REAL,
            cest TEXT,
            ean TEXT,
            editadoManualmente INTEGER DEFAULT 0,
            FOREIGN KEY (importacaoId) REFERENCES importacoes(id)
          )
        `, (err) => {
          if (err) console.error('Erro ao criar tabela importacao_itens:', err);
        });

        resolve(db);
      });
    });
  });
}

export function getDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

export function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

export function getAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function allAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}
