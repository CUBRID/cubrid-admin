#!/bin/sh
# Upgrades from test builds that installed to "/opt/CUBRID Admin" or /opt/cubrid-admin
# (now the server's folder): remove the desktop's empty folders there, only.
[ -d "/opt/CUBRID Admin" ] && find "/opt/CUBRID Admin" -depth -type d -empty -delete 2>/dev/null
for dir in resources/web-manager/assets resources/web-manager resources/api-server resources locales; do
  rmdir "/opt/cubrid-admin/$dir" 2>/dev/null
done
rmdir /opt/cubrid-admin 2>/dev/null
exit 0
