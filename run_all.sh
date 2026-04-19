npm run typecheck 2>&1 | tail -n 5
EXIT_TC=$?
if [ $EXIT_TC -ne 0 ]; then
  echo EXIT:$EXIT_TC
  exit $EXIT_TC
fi
echo EXIT:0
npm test --workspace apps/api 2>&1 | tail -n 12
EXIT_TEST=$?
echo EXIT:$EXIT_TEST
