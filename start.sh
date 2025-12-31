#!/bin/bash

# Verificar se o diretório dist existe
if [ ! -d "dist" ]; then
    echo "Diretório dist não encontrado. Executando build..."
    npm run build
fi

# Iniciar o servidor
echo "Iniciando servidor..."
node server.cjs
