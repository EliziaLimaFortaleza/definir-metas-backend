const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Inicializar banco de dados
const initDatabase = require('./database/init');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware de segurança
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // limite de 100 requests por IP
});
app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Rotas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/concursos', require('./routes/concursos'));
app.use('/api/materias', require('./routes/materias'));
app.use('/api/metas', require('./routes/metas'));
app.use('/api/estudos', require('./routes/estudos'));
app.use('/api/questoes', require('./routes/questoes'));
app.use('/api/parceiros', require('./routes/parceiros'));
app.use('/api/progresso', require('./routes/progresso'));

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ message: 'Sistema de Estudos Pessoal - Backend funcionando!' });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Rota 404
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

// Para desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📚 Sistema de Estudos Pessoal - Backend`);
  });
}

// Exportar para o Vercel
module.exports = app; 