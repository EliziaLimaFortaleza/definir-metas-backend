# Definir Metas - Backend API

Backend do Sistema de Estudos Pessoal desenvolvido em Node.js com Express e SQLite.

## 🚀 Tecnologias

- Node.js
- Express.js
- SQLite3
- JWT (Autenticação)
- Nodemailer (E-mails)
- Multer (Upload de arquivos)

## 📋 Pré-requisitos

- Node.js 18+
- npm ou yarn

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone https://github.com/SEU_USUARIO/definir-metas-backend.git
cd definir-metas-backend
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp env.example .env
# Edite o arquivo .env com suas configurações
```

4. Inicialize o banco de dados:
```bash
npm run init-db
```

5. Execute o servidor:
```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

## 🌐 Deploy no Vercel

1. Conecte o repositório ao Vercel
2. Configure as variáveis de ambiente:
   - `JWT_SECRET`
   - `EMAIL_USER`
   - `EMAIL_PASS`
   - `NODE_ENV=production`
3. Deploy automático a cada push

## 📚 Endpoints da API

### Autenticação
- `POST /api/auth/registro` - Registrar usuário
- `POST /api/auth/login` - Login
- `GET /api/auth/verificar` - Verificar token

### Concursos
- `GET /api/concursos` - Listar concursos
- `POST /api/concursos` - Criar concurso
- `PUT /api/concursos/:id` - Atualizar concurso
- `DELETE /api/concursos/:id` - Excluir concurso

### Matérias
- `GET /api/materias` - Listar matérias
- `POST /api/materias` - Criar matéria
- `PUT /api/materias/:id` - Atualizar matéria
- `DELETE /api/materias/:id` - Excluir matéria

### Metas
- `GET /api/metas` - Listar metas
- `POST /api/metas` - Criar meta
- `PUT /api/metas/:id` - Atualizar meta
- `DELETE /api/metas/:id` - Excluir meta

### Estudos
- `GET /api/estudos` - Listar estudos
- `POST /api/estudos` - Registrar estudo
- `PUT /api/estudos/:id` - Atualizar estudo
- `DELETE /api/estudos/:id` - Excluir estudo

### Questões
- `GET /api/questoes` - Listar questões
- `POST /api/questoes` - Criar questão
- `PUT /api/questoes/:id` - Atualizar questão
- `DELETE /api/questoes/:id` - Excluir questão

### Parceiros
- `GET /api/parceiros` - Listar parceiros
- `POST /api/parceiros/convidar` - Convidar parceiro
- `POST /api/parceiros/:id/compartilhar-meta` - Compartilhar meta

### Progresso
- `GET /api/progresso/geral` - Progresso geral
- `GET /api/progresso/materias` - Progresso por matéria
- `GET /api/progresso/historico` - Histórico de estudos

## 📝 Licença

Este projeto está sob a licença MIT. 