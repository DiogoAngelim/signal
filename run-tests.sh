#!/bin/bash

# Signal Framework Test Runner
# Comprehensive test suite with coverage reporting

echo "🧪 Signal Framework Test Suite"
echo "=============================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Parse arguments
if [ "$1" = "--coverage" ] || [ "$1" = "-c" ]; then
    echo "📊 Running tests with coverage report..."
    npm run test:coverage
    
    echo ""
    echo "📈 Coverage Report:"
    if [ -f "coverage/lcov-report/index.html" ]; then
        echo "   HTML Report: coverage/lcov-report/index.html"
        echo "   Open in browser to view detailed coverage"
    fi
    
elif [ "$1" = "--watch" ] || [ "$1" = "-w" ]; then
    echo "👀 Running tests in watch mode..."
    echo "   Press 'q' to quit"
    npm run test:watch
    
elif [ "$1" = "--production" ] || [ "$1" = "-p" ]; then
    echo "🚀 Running production scenario test..."
    npm run test:production
    
elif [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: ./run-tests.sh [options]"
    echo ""
    echo "Options:"
    echo "  --coverage, -c    Run tests with coverage report"
    echo "  --watch, -w       Run tests in watch mode"
    echo "  --production, -p  Run production scenario test"
    echo "  --help, -h        Show this help message"
    echo "  (default)         Run all tests once"
    echo ""
    echo "Examples:"
    echo "  ./run-tests.sh              # Run all tests"
    echo "  ./run-tests.sh --coverage   # Run with coverage"
    echo "  ./run-tests.sh --watch      # Watch mode for development"
    echo "  ./run-tests.sh --production # Full integration scenario"
    
else
    echo "🧪 Running all tests..."
    npm test
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ All tests passed!"
        echo ""
        echo "💡 Tip: Run with --coverage to see coverage report"
        echo "         ./run-tests.sh --coverage"
    else
        echo ""
        echo "❌ Some tests failed"
        exit 1
    fi
fi
