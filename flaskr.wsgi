##Replace the standard out
import sys
##Add this file path to sys.path in order to import settings
sys.path.insert(0,'/var/www/html/auprice/')
##Add this file path to sys.path in order to import app
from auprice import app as application
