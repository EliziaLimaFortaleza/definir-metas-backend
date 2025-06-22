const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🗄️ Inicializando banco de dados...');

// Criar tabelas
db.serialize(() => {
  // Tabela de usuários
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabela de concursos
  db.run(`CREATE TABLE IF NOT EXISTS concursos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cargo TEXT,
    usuario_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  )`);

  // Tabela de matérias
  db.run(`CREATE TABLE IF NOT EXISTS materias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT,
    ordem INTEGER DEFAULT 0,
    usuario_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  )`);

  // Tabela de assuntos/tópicos
  db.run(`CREATE TABLE IF NOT EXISTS assuntos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT,
    ordem INTEGER DEFAULT 0,
    materia_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (materia_id) REFERENCES materias (id)
  )`);

  // Tabela de metas
  db.run(`CREATE TABLE IF NOT EXISTS metas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descricao TEXT,
    tipo TEXT NOT NULL, -- 'geral' ou 'concurso'
    carga_horaria_total INTEGER, -- em minutos
    carga_horaria_diaria INTEGER, -- em minutos
    data_inicio DATE,
    data_fim DATE,
    status TEXT DEFAULT 'pendente', -- 'pendente', 'em_andamento', 'concluida'
    usuario_id INTEGER,
    concurso_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
    FOREIGN KEY (concurso_id) REFERENCES concursos (id)
  )`);

  // Tabela de metas por matéria
  db.run(`CREATE TABLE IF NOT EXISTS metas_materias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meta_id INTEGER,
    materia_id INTEGER,
    carga_horaria INTEGER, -- em minutos
    status TEXT DEFAULT 'pendente',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meta_id) REFERENCES metas (id),
    FOREIGN KEY (materia_id) REFERENCES materias (id)
  )`);

  // Tabela de metas por assunto
  db.run(`CREATE TABLE IF NOT EXISTS metas_assuntos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meta_id INTEGER,
    assunto_id INTEGER,
    carga_horaria INTEGER, -- em minutos
    status TEXT DEFAULT 'pendente',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meta_id) REFERENCES metas (id),
    FOREIGN KEY (assunto_id) REFERENCES assuntos (id)
  )`);

  // Tabela de registros de estudo
  db.run(`CREATE TABLE IF NOT EXISTS estudos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data DATE NOT NULL,
    duracao INTEGER NOT NULL, -- em minutos
    observacoes TEXT,
    proximo_assunto_id INTEGER,
    usuario_id INTEGER,
    materia_id INTEGER,
    assunto_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
    FOREIGN KEY (materia_id) REFERENCES materias (id),
    FOREIGN KEY (assunto_id) REFERENCES assuntos (id),
    FOREIGN KEY (proximo_assunto_id) REFERENCES assuntos (id)
  )`);

  // Tabela de questões do caderno de erros
  db.run(`CREATE TABLE IF NOT EXISTS questoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    texto TEXT NOT NULL,
    imagem_url TEXT,
    comentario TEXT,
    foi_refeita BOOLEAN DEFAULT 0,
    foi_acertada BOOLEAN DEFAULT 0,
    materia_id INTEGER,
    assunto_id INTEGER,
    usuario_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (materia_id) REFERENCES materias (id),
    FOREIGN KEY (assunto_id) REFERENCES assuntos (id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  )`);

  // Tabela de parceiros de estudo
  db.run(`CREATE TABLE IF NOT EXISTS parceiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    parceiro_email TEXT NOT NULL,
    parceiro_nome TEXT,
    status TEXT DEFAULT 'pendente', -- 'pendente', 'aceito', 'rejeitado'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  )`);

  // Tabela de compartilhamento de metas
  db.run(`CREATE TABLE IF NOT EXISTS metas_compartilhadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meta_id INTEGER,
    parceiro_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meta_id) REFERENCES metas (id),
    FOREIGN KEY (parceiro_id) REFERENCES parceiros (id)
  )`);

  // Tabela de notificações
  db.run(`CREATE TABLE IF NOT EXISTS notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL, -- 'meta_concluida', 'novo_estudo', 'convite_parceiro'
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    usuario_id INTEGER,
    parceiro_id INTEGER,
    lida BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
    FOREIGN KEY (parceiro_id) REFERENCES parceiros (id)
  )`);

  console.log('✅ Tabelas criadas com sucesso!');
});

// Inserir dados de exemplo
db.serialize(() => {
  // Inserir usuário de exemplo
  db.run(`INSERT OR IGNORE INTO usuarios (id, nome, email, senha) VALUES 
    (1, 'Usuário Exemplo', 'usuario@exemplo.com', '$2a$10$example.hash')`);

  // Inserir matérias de exemplo
  db.run(`INSERT OR IGNORE INTO materias (id, nome, descricao, ordem, usuario_id) VALUES 
    (1, 'Português', 'Língua Portuguesa', 1, 1),
    (2, 'Matemática', 'Matemática Básica', 2, 1),
    (3, 'Direito Constitucional', 'Direito Constitucional', 3, 1),
    (4, 'Direito Administrativo', 'Direito Administrativo', 4, 1)`);

  // Inserir assuntos de exemplo
  db.run(`INSERT OR IGNORE INTO assuntos (id, nome, descricao, ordem, materia_id) VALUES 
    (1, 'Gramática', 'Regras gramaticais', 1, 1),
    (2, 'Interpretação de Texto', 'Compreensão textual', 2, 1),
    (3, 'Álgebra', 'Equações e expressões', 1, 2),
    (4, 'Geometria', 'Formas geométricas', 2, 2),
    (5, 'Constituição Federal', 'Artigos da CF', 1, 3),
    (6, 'Princípios Constitucionais', 'Princípios fundamentais', 2, 3)`);

  console.log('✅ Dados de exemplo inseridos!');
});

db.close((err) => {
  if (err) {
    console.error('❌ Erro ao fechar banco de dados:', err.message);
  } else {
    console.log('✅ Banco de dados inicializado com sucesso!');
  }
}); 